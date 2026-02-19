import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Poller } from './poller.js';
import type { MetadataSource, RawLabelEvent, TxDetails, BlockInfo } from '../sources/types.js';
import type { ResolvedIndexerConfig } from '../config/types.js';
import type { EventProcessor } from './types.js';

// ─── Mock processEvents ───

const mockProcessEvents = vi.fn();
vi.mock('./processor.js', () => ({
  processEvents: (...args: any[]) => mockProcessEvents(...args),
}));

// ─── Constants ───

const LABEL = 199674;
const PAGE_SIZE = 100; // Matches poller.ts

// ─── Helpers ───

function makeTxDetail(txHash: string, blockHeight: number): TxDetails {
  return {
    txHash,
    txIndex: 0,
    blockHeight,
    blockHash: `block_${blockHeight}`,
    blockTime: blockHeight * 10,
  };
}

function makeRawEvent(txHash: string): RawLabelEvent {
  return { txHash, jsonMetadata: { test: true } };
}

/**
 * Create a mock MetadataSource with controllable page data and tx details.
 */
function createMockSource(opts: {
  pages: Record<number, RawLabelEvent[]>;
  txDetails: Record<string, TxDetails>;
  headEvent?: RawLabelEvent;
  checkpointBlockInfo?: Record<number, BlockInfo | null>;
}): MetadataSource {
  return {
    listRawLabelEvents: vi.fn().mockImplementation(
      (_label: number, _order: string, page: number, count: number) => {
        if (count === 1 && opts.headEvent) {
          return Promise.resolve([opts.headEvent]);
        }
        return Promise.resolve(opts.pages[page] ?? []);
      }
    ),
    getTxDetails: vi.fn().mockImplementation((txHash: string) => {
      const detail = opts.txDetails[txHash];
      if (!detail) throw new Error(`No mock TxDetails for ${txHash}`);
      return Promise.resolve(detail);
    }),
    getBlockByHeight: vi.fn().mockImplementation((height: number) => {
      return Promise.resolve(opts.checkpointBlockInfo?.[height] ?? null);
    }),
    getChainTip: vi.fn().mockResolvedValue(10000),
    listLabelEvents: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Create a mock Drizzle DB that handles checkpoint reads, dedup queries,
 * and checkpoint writes. Follows the chain-validator.test.ts pattern.
 */
function createMockDb(opts: {
  checkpoint: {
    label: number;
    lastBlockHeight: number;
    lastBlockHash: string | null;
    lastTxHash: string | null;
  } | null;
  knownTxHashes: string[];
}) {
  const checkpointUpdates: any[] = [];

  const db = {
    select: vi.fn().mockImplementation((fields?: any) => {
      const isDedup = fields && 'txHash' in fields;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (isDedup) {
              // Return known hashes — Set.has() in real code handles filtering
              return Promise.resolve(
                opts.knownTxHashes.map(h => ({ txHash: h }))
              );
            }
            // Checkpoint query — needs .limit()
            return {
              limit: vi.fn().mockReturnValue(
                Promise.resolve(opts.checkpoint ? [opts.checkpoint] : [])
              ),
            };
          }),
        }),
      };
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((vals: any) => {
        checkpointUpdates.push(vals);
        return {
          onConflictDoUpdate: vi.fn().mockReturnValue(Promise.resolve()),
        };
      }),
    }),
    _checkpointUpdates: checkpointUpdates,
  };

  return db as any;
}

function createMockProcessor(): EventProcessor {
  return {
    table: { txHash: 'tx_hash' } as any,
    schema: { safeParse: () => ({ success: true, data: {} }) } as any,
    verify: vi.fn().mockResolvedValue({ valid: true }),
    makeRow: vi.fn().mockReturnValue({}),
  };
}

function createConfig(processor: EventProcessor): ResolvedIndexerConfig {
  return {
    name: 'Test Indexer',
    labels: [LABEL],
    eventsTable: 'did_events',
    schemas: {} as any,
    endpoints: [],
    network: 'preprod',
    pollIntervalMs: 30000,
    confirmationDepth: 10,
    processors: { [LABEL]: processor },
  };
}

// ─── Tests ───

describe('Poller.incrementalPoll — crash recovery', () => {
  let processor: EventProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = createMockProcessor();
    mockProcessEvents.mockResolvedValue({ processed: 0, valid: 0, invalid: 0, skipped: 0 });
  });

  it('continues past all-known page when oldest event is above checkpoint (crash recovery)', async () => {
    // Scenario: checkpoint at height 100. A prior run inserted a full page of events
    // (heights 300 down to 201) but crashed before updating the checkpoint.
    // Page 2 has unseen events at heights 150,110.

    // Build a full page of PAGE_SIZE known events (heights 300..201)
    const page1Events: RawLabelEvent[] = [];
    const knownTxHashes: string[] = [];
    const txDetails: Record<string, TxDetails> = {};
    for (let i = 0; i < PAGE_SIZE; i++) {
      const txHash = `tx_known_${i}`;
      const height = 300 - i; // 300, 299, ..., 201
      page1Events.push(makeRawEvent(txHash));
      knownTxHashes.push(txHash);
      txDetails[txHash] = makeTxDetail(txHash, height);
    }

    // Page 2: unseen gap events
    txDetails['tx_gap2'] = makeTxDetail('tx_gap2', 150);
    txDetails['tx_gap1'] = makeTxDetail('tx_gap1', 110);

    const source = createMockSource({
      pages: {
        1: page1Events,
        2: [makeRawEvent('tx_gap2'), makeRawEvent('tx_gap1')],
        3: [],
      },
      txDetails,
      headEvent: makeRawEvent('tx_NEW'), // head changed → triggers incremental poll
      checkpointBlockInfo: { 100: { height: 100, hash: 'block_100', time: 1000 } },
    });

    const db = createMockDb({
      checkpoint: { label: LABEL, lastBlockHeight: 100, lastBlockHash: 'block_100', lastTxHash: 'tx_old' },
      knownTxHashes,
    });

    mockProcessEvents.mockResolvedValue({ processed: 2, valid: 2, invalid: 0, skipped: 0 });

    const config = createConfig(processor);
    const poller = new Poller(db, source, config);
    // Seed pollCycle so rollback check doesn't run on cycle 0
    (poller as any).pollCycle = 1;

    const result = await (poller as any).pollLabel(LABEL);

    // Should have processed the 2 events from page 2
    expect(result).toBeGreaterThan(0);
    expect(mockProcessEvents).toHaveBeenCalled();

    // Verify processEvents received the gap events (tx_gap2, tx_gap1)
    const enrichedEvents = mockProcessEvents.mock.calls[0]![1];
    const processedHashes = enrichedEvents.map((e: any) => e.txHash);
    expect(processedHashes).toContain('tx_gap2');
    expect(processedHashes).toContain('tx_gap1');

    // Verify we fetched page 2 (paged past the all-known page 1)
    expect(source.listRawLabelEvents).toHaveBeenCalledWith(LABEL, 'desc', 2, PAGE_SIZE);
  });

  it('stops when all events on page are known and at/below checkpoint (normal case)', async () => {
    // Normal operation: page 1 has events at height 100 (checkpoint) and 90 (below).
    // All known. Since oldest (90) <= checkpoint (100), safe to stop.
    const source = createMockSource({
      pages: {
        // Full page so the "last page" short-circuit doesn't fire
        1: Array.from({ length: PAGE_SIZE }, (_, i) => makeRawEvent(`tx_${i}`)),
      },
      txDetails: {
        // Oldest event on page (last in array) is at checkpoint height
        ...Object.fromEntries(
          Array.from({ length: PAGE_SIZE }, (_, i) =>
            [`tx_${i}`, makeTxDetail(`tx_${i}`, 100 - Math.floor(i / 10))]
          )
        ),
      },
      headEvent: makeRawEvent('tx_NEW'),
      checkpointBlockInfo: { 100: { height: 100, hash: 'block_100', time: 1000 } },
    });

    const allHashes = Array.from({ length: PAGE_SIZE }, (_, i) => `tx_${i}`);
    const db = createMockDb({
      checkpoint: { label: LABEL, lastBlockHeight: 100, lastBlockHash: 'block_100', lastTxHash: 'tx_old' },
      knownTxHashes: allHashes,
    });

    const config = createConfig(processor);
    const poller = new Poller(db, source, config);
    (poller as any).pollCycle = 1;

    const result = await (poller as any).pollLabel(LABEL);

    expect(result).toBe(0);
    // Should NOT have fetched page 2
    expect(source.listRawLabelEvents).not.toHaveBeenCalledWith(LABEL, 'desc', 2, PAGE_SIZE);
  });

  it('handles multiple all-known pages before finding new events', async () => {
    // Crash scenario with a wider gap: pages 1 and 2 are all known,
    // page 3 has the unseen events.
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => makeRawEvent(`p1_tx_${i}`));
    const page2 = Array.from({ length: PAGE_SIZE }, (_, i) => makeRawEvent(`p2_tx_${i}`));
    const page3 = [makeRawEvent('tx_new1'), makeRawEvent('tx_new2')];

    const txDetails: Record<string, TxDetails> = {};
    // Page 1: heights 500-401
    page1.forEach((e, i) => { txDetails[e.txHash] = makeTxDetail(e.txHash, 500 - i); });
    // Page 2: heights 400-301
    page2.forEach((e, i) => { txDetails[e.txHash] = makeTxDetail(e.txHash, 400 - i); });
    // Page 3: heights 250, 200
    txDetails['tx_new1'] = makeTxDetail('tx_new1', 250);
    txDetails['tx_new2'] = makeTxDetail('tx_new2', 200);

    const knownHashes = [...page1.map(e => e.txHash), ...page2.map(e => e.txHash)];

    const source = createMockSource({
      pages: { 1: page1, 2: page2, 3: page3, 4: [] },
      txDetails,
      headEvent: makeRawEvent('tx_changed'),
      checkpointBlockInfo: { 100: { height: 100, hash: 'block_100', time: 1000 } },
    });

    const db = createMockDb({
      checkpoint: { label: LABEL, lastBlockHeight: 100, lastBlockHash: 'block_100', lastTxHash: 'tx_old' },
      knownTxHashes: knownHashes,
    });

    mockProcessEvents.mockResolvedValue({ processed: 2, valid: 2, invalid: 0, skipped: 0 });

    const config = createConfig(processor);
    const poller = new Poller(db, source, config);
    (poller as any).pollCycle = 1;

    const result = await (poller as any).pollLabel(LABEL);

    expect(result).toBeGreaterThan(0);
    // Should have paged through to page 3
    expect(source.listRawLabelEvents).toHaveBeenCalledWith(LABEL, 'desc', 3, PAGE_SIZE);
  });

  it('returns 0 when no events exist (empty page 1)', async () => {
    const source = createMockSource({
      pages: { 1: [] },
      txDetails: {},
      headEvent: makeRawEvent('tx_NEW'),
      checkpointBlockInfo: { 100: { height: 100, hash: 'block_100', time: 1000 } },
    });

    const db = createMockDb({
      checkpoint: { label: LABEL, lastBlockHeight: 100, lastBlockHash: 'block_100', lastTxHash: 'tx_old' },
      knownTxHashes: [],
    });

    const config = createConfig(processor);
    const poller = new Poller(db, source, config);
    (poller as any).pollCycle = 1;

    const result = await (poller as any).pollLabel(LABEL);

    expect(result).toBe(0);
    expect(mockProcessEvents).not.toHaveBeenCalled();
  });

  it('processes new events and stops at partial page (normal incremental)', async () => {
    // Normal incremental: page 1 has 3 new events (partial page < PAGE_SIZE)
    const source = createMockSource({
      pages: {
        1: [makeRawEvent('tx_new1'), makeRawEvent('tx_new2'), makeRawEvent('tx_new3')],
      },
      txDetails: {
        tx_new1: makeTxDetail('tx_new1', 150),
        tx_new2: makeTxDetail('tx_new2', 140),
        tx_new3: makeTxDetail('tx_new3', 130),
      },
      headEvent: makeRawEvent('tx_new1'),
      checkpointBlockInfo: { 100: { height: 100, hash: 'block_100', time: 1000 } },
    });

    const db = createMockDb({
      checkpoint: { label: LABEL, lastBlockHeight: 100, lastBlockHash: 'block_100', lastTxHash: 'tx_old' },
      knownTxHashes: [],
    });

    mockProcessEvents.mockResolvedValue({ processed: 3, valid: 3, invalid: 0, skipped: 0 });

    const config = createConfig(processor);
    const poller = new Poller(db, source, config);
    (poller as any).pollCycle = 1;

    const result = await (poller as any).pollLabel(LABEL);

    expect(result).toBe(3);
    expect(mockProcessEvents).toHaveBeenCalledTimes(1);
    // Only page 1 fetched (partial page = last page)
    expect(source.listRawLabelEvents).not.toHaveBeenCalledWith(LABEL, 'desc', 2, PAGE_SIZE);
  });

  it('skips poll entirely when heartbeat shows no change', async () => {
    const source = createMockSource({
      pages: {},
      txDetails: {},
      headEvent: makeRawEvent('tx_same'), // matches lastTxHash
    });

    const db = createMockDb({
      checkpoint: { label: LABEL, lastBlockHeight: 100, lastBlockHash: 'block_100', lastTxHash: 'tx_same' },
      knownTxHashes: [],
    });

    const config = createConfig(processor);
    const poller = new Poller(db, source, config);
    (poller as any).pollCycle = 1;

    const result = await (poller as any).pollLabel(LABEL);

    expect(result).toBe(0);
    expect(mockProcessEvents).not.toHaveBeenCalled();
  });
});
