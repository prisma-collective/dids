import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processEvents } from './processor.js';
import { didEventProcessor } from './did-processor.js';
import type { MetadataEvent } from '../sources/types.js';
import type { EventProcessor, VerifyResult } from './types.js';

/**
 * Indexer-level E2E: runs the real processEvents() pipeline with didEventProcessor
 * and a stateful mock DB. Tests ordering, progressive persistence, schema→verify→chain
 * merge, and dedup — the highest-risk logic in the indexer.
 *
 * Mock strategy:
 * - verify() overridden on processor (avoids COSE_Sign1 infra)
 * - validateDIDChain mocked via vi.mock with in-memory chain logic against shared rowStore
 * - Mock DB supports insert().values().onConflictDoNothing().returning() for progressive persistence
 */

// ─── Shared state (hoisted for mock access) ───

const { rowStore, mockValidateChain } = vi.hoisted(() => {
  const store: Record<string, unknown>[] = [];

  const chainValidator = vi.fn().mockImplementation(
    async (_db: unknown, event: Record<string, unknown>, _txHash: string) => {
      const did = event.id as string;

      if (event.action === 'create') {
        if (event.v !== 1) return { valid: false, error: 'create_version_not_1' };
        if (event.prev !== null) return { valid: false, error: 'create_has_prev' };
        const existing = store.find(
          (r) => r.did === did && r.action === 'create' && r.valid === true,
        );
        if (existing) return { valid: false, error: 'duplicate_create' };
        return { valid: true };
      }

      // update or revoke
      if (event.prev === null) return { valid: false, error: 'missing_prev' };
      const prevEvent = store.find(
        (r) => r.txHash === event.prev && r.did === did && r.valid === true,
      );
      if (!prevEvent) return { valid: false, error: 'broken_chain' };
      if ((event.v as number) <= (prevEvent.version as number))
        return { valid: false, error: 'version_not_increasing' };
      const fork = store.find(
        (r) => r.prevTxHash === event.prev && r.did === did && r.valid === true,
      );
      if (fork) return { valid: false, error: 'fork_detected' };
      return { valid: true };
    },
  );

  return { rowStore: store, mockValidateChain: chainValidator };
});

// Mock chain-validator module — didEventProcessor.validateChain will use this
vi.mock('./chain-validator.js', () => ({
  validateDIDChain: mockValidateChain,
}));

// ─── Constants ───

const TEST_DID = 'did:cardano:stake_test1uztest';
const TEST_IPFS = 'QmTestCID123';
const TEST_STAKE = 'stake_test1uztest';

// ─── Helpers ───

/** Build a MetadataEvent with DID event fields embedded in jsonMetadata. */
function makeRawEvent(fields: {
  txHash: string;
  action: string;
  v: number;
  prev?: string | null;
  ipfs?: string;
  blockHeight?: number;
  txIndex?: number;
}): MetadataEvent {
  return {
    txHash: fields.txHash,
    txIndex: fields.txIndex ?? 0,
    blockHeight: fields.blockHeight ?? 1000,
    blockHash: 'block_abc',
    blockTime: 1704067200,
    jsonMetadata: {
      id: TEST_DID,
      ipfs: fields.ipfs ?? TEST_IPFS,
      action: fields.action,
      v: fields.v,
      prev: fields.prev ?? '', // null → '' for Cardano metadata format
      payloadSig: JSON.stringify({ sig: 'aa', key: 'bb', address: 'cc' }),
      ts: '2025-01-01T00:00:00.000Z',
    },
  };
}

/** In-memory mock DB — insert populates shared rowStore, supports dedup on txHash. */
function createMockDb() {
  return {
    insert: (_table: unknown) => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: (_opts?: unknown) => ({
          returning: (_fields?: unknown) => {
            const exists = rowStore.some((r) => r.txHash === row.txHash);
            if (exists) return Promise.resolve([]);
            rowStore.push({ ...row });
            return Promise.resolve([{ txHash: row.txHash }]);
          },
        }),
      }),
    }),
  };
}

// Mock verify — returns valid with stake address (no COSE infra needed)
const mockVerify = vi.fn<(event: unknown) => Promise<VerifyResult>>();

// Test processor: real schema + makeRow + table, mocked verify + chain validator
const testProcessor: EventProcessor = {
  ...didEventProcessor,
  verify: mockVerify,
};

// ─── Tests ───

describe('DID Lifecycle E2E (Indexer)', () => {
  beforeEach(() => {
    rowStore.length = 0;
    mockVerify.mockReset();
    mockVerify.mockResolvedValue({ valid: true, signerStakeAddress: TEST_STAKE });
    mockValidateChain.mockClear(); // Keep implementation, clear call history
  });

  // ─── Happy path (through processEvents) ───

  describe('happy path', () => {
    it('single create event → processed:1, valid:1', async () => {
      const db = createMockDb();
      const events = [makeRawEvent({ txHash: 'tx_create', action: 'create', v: 1 })];

      const result = await processEvents(db as any, events, testProcessor);

      expect(result).toEqual({ processed: 1, valid: 1, invalid: 0, skipped: 0 });
      expect(rowStore).toHaveLength(1);
      expect(rowStore[0]!.did).toBe(TEST_DID);
      expect(rowStore[0]!.action).toBe('create');
      expect(rowStore[0]!.valid).toBe(true);
    });

    it('batch of create+update → both valid via progressive persistence', async () => {
      const db = createMockDb();
      const events = [
        makeRawEvent({ txHash: 'tx_c', action: 'create', v: 1, blockHeight: 1000, txIndex: 0 }),
        makeRawEvent({
          txHash: 'tx_u',
          action: 'update',
          v: 2,
          prev: 'tx_c',
          blockHeight: 1000,
          txIndex: 1,
        }),
      ];

      const result = await processEvents(db as any, events, testProcessor);

      expect(result).toEqual({ processed: 2, valid: 2, invalid: 0, skipped: 0 });
      expect(rowStore).toHaveLength(2);
      expect(rowStore[0]!.action).toBe('create');
      expect(rowStore[1]!.action).toBe('update');
      expect(rowStore.every((r) => r.valid === true)).toBe(true);
    });

    it('batch of create+update+revoke → all 3 valid, chain intact', async () => {
      const db = createMockDb();
      const events = [
        makeRawEvent({ txHash: 'tx_c', action: 'create', v: 1, blockHeight: 1000, txIndex: 0 }),
        makeRawEvent({
          txHash: 'tx_u',
          action: 'update',
          v: 2,
          prev: 'tx_c',
          blockHeight: 1000,
          txIndex: 1,
        }),
        makeRawEvent({
          txHash: 'tx_r',
          action: 'revoke',
          v: 3,
          prev: 'tx_u',
          blockHeight: 1000,
          txIndex: 2,
        }),
      ];

      const result = await processEvents(db as any, events, testProcessor);

      expect(result).toEqual({ processed: 3, valid: 3, invalid: 0, skipped: 0 });
      expect(rowStore.map((r) => r.action)).toEqual(['create', 'update', 'revoke']);
      expect(rowStore.map((r) => r.version)).toEqual([1, 2, 3]);
    });

    it('events arrive out of order → processEvents sorts correctly', async () => {
      const db = createMockDb();
      // Input order: update first, create second — but txIndex says create is first
      const events = [
        makeRawEvent({
          txHash: 'tx_u',
          action: 'update',
          v: 2,
          prev: 'tx_c',
          blockHeight: 1000,
          txIndex: 5,
        }),
        makeRawEvent({ txHash: 'tx_c', action: 'create', v: 1, blockHeight: 1000, txIndex: 0 }),
      ];

      const result = await processEvents(db as any, events, testProcessor);

      expect(result).toEqual({ processed: 2, valid: 2, invalid: 0, skipped: 0 });
      // Create processed first (lower txIndex) despite being second in input
      expect(rowStore[0]!.action).toBe('create');
      expect(rowStore[1]!.action).toBe('update');
    });
  });

  // ─── Rejection path (through processEvents) ───

  describe('rejection path', () => {
    it('duplicate create for same DID (second batch) → invalid', async () => {
      const db = createMockDb();
      // First batch: create succeeds
      await processEvents(
        db as any,
        [makeRawEvent({ txHash: 'tx_c1', action: 'create', v: 1 })],
        testProcessor,
      );

      // Second batch: another create for same DID
      const result = await processEvents(
        db as any,
        [makeRawEvent({ txHash: 'tx_c2', action: 'create', v: 1 })],
        testProcessor,
      );

      expect(result.invalid).toBe(1);
      const row = rowStore.find((r) => r.txHash === 'tx_c2')!;
      expect(row.valid).toBe(false);
      expect(row.validationError).toBe('duplicate_create');
    });

    it('update with wrong version → invalid', async () => {
      const db = createMockDb();
      await processEvents(
        db as any,
        [makeRawEvent({ txHash: 'tx_c', action: 'create', v: 1 })],
        testProcessor,
      );

      // Update with v=1 (should be > 1)
      const result = await processEvents(
        db as any,
        [makeRawEvent({ txHash: 'tx_u', action: 'update', v: 1, prev: 'tx_c' })],
        testProcessor,
      );

      expect(result.invalid).toBe(1);
      const row = rowStore.find((r) => r.txHash === 'tx_u')!;
      expect(row.valid).toBe(false);
      expect(row.validationError).toBe('version_not_increasing');
    });

    it('update with broken chain (bad prev) → invalid', async () => {
      const db = createMockDb();
      await processEvents(
        db as any,
        [makeRawEvent({ txHash: 'tx_c', action: 'create', v: 1 })],
        testProcessor,
      );

      // Update with prev pointing to non-existent tx
      const result = await processEvents(
        db as any,
        [makeRawEvent({ txHash: 'tx_u', action: 'update', v: 2, prev: 'tx_nonexistent' })],
        testProcessor,
      );

      expect(result.invalid).toBe(1);
      const row = rowStore.find((r) => r.txHash === 'tx_u')!;
      expect(row.valid).toBe(false);
      expect(row.validationError).toBe('broken_chain');
    });

    it('fork: two updates sharing same prev → second invalid', async () => {
      const db = createMockDb();
      // Setup: create + first update
      await processEvents(
        db as any,
        [
          makeRawEvent({
            txHash: 'tx_c',
            action: 'create',
            v: 1,
            blockHeight: 1000,
            txIndex: 0,
          }),
          makeRawEvent({
            txHash: 'tx_u1',
            action: 'update',
            v: 2,
            prev: 'tx_c',
            blockHeight: 1000,
            txIndex: 1,
          }),
        ],
        testProcessor,
      );

      // Second update with same prev as first update → fork
      const result = await processEvents(
        db as any,
        [makeRawEvent({ txHash: 'tx_u2', action: 'update', v: 3, prev: 'tx_c' })],
        testProcessor,
      );

      expect(result.invalid).toBe(1);
      const row = rowStore.find((r) => r.txHash === 'tx_u2')!;
      expect(row.valid).toBe(false);
      expect(row.validationError).toBe('fork_detected');
    });

    it('schema-invalid event (missing id) → invalid, verify never called', async () => {
      const db = createMockDb();
      const events: MetadataEvent[] = [
        {
          txHash: 'tx_bad',
          txIndex: 0,
          blockHeight: 1000,
          blockHash: 'block_abc',
          blockTime: 1704067200,
          jsonMetadata: {
            // Missing id and ipfs — fails DIDEventSchema
            action: 'create',
            v: 1,
            prev: '',
            payloadSig: 'sig',
            ts: '2025-01-01T00:00:00.000Z',
          },
        },
      ];

      const result = await processEvents(db as any, events, testProcessor);

      expect(result.invalid).toBe(1);
      expect(mockVerify).not.toHaveBeenCalled(); // Schema fails before verify
      const row = rowStore.find((r) => r.txHash === 'tx_bad')!;
      expect(row.valid).toBe(false);
      expect(row.validationError).toBe('schema_invalid');
    });
  });

  // ─── Dedup path ───

  describe('dedup', () => {
    it('same txHash submitted twice → second is skipped', async () => {
      const db = createMockDb();
      const events = [makeRawEvent({ txHash: 'tx_c', action: 'create', v: 1 })];

      const result1 = await processEvents(db as any, events, testProcessor);
      expect(result1.valid).toBe(1);

      const result2 = await processEvents(db as any, events, testProcessor);
      expect(result2.skipped).toBe(1);
      expect(rowStore).toHaveLength(1); // Only one row despite two submissions
    });
  });

  // ─── Chain validation edge cases ───

  describe('chain validation edge cases', () => {
    it('create with v≠1 → invalid', async () => {
      const db = createMockDb();
      const events = [makeRawEvent({ txHash: 'tx_c', action: 'create', v: 2 })];

      const result = await processEvents(db as any, events, testProcessor);

      expect(result.invalid).toBe(1);
      const row = rowStore[0]!;
      expect(row.valid).toBe(false);
      expect(row.validationError).toBe('create_version_not_1');
    });

    it('update with prev=null → invalid', async () => {
      const db = createMockDb();
      // Setup: create
      await processEvents(
        db as any,
        [makeRawEvent({ txHash: 'tx_c', action: 'create', v: 1 })],
        testProcessor,
      );

      // Update with no prev (prev defaults to '' → reconstructed to null)
      const result = await processEvents(
        db as any,
        [makeRawEvent({ txHash: 'tx_u', action: 'update', v: 2 })],
        testProcessor,
      );

      expect(result.invalid).toBe(1);
      const row = rowStore.find((r) => r.txHash === 'tx_u')!;
      expect(row.valid).toBe(false);
      expect(row.validationError).toBe('missing_prev');
    });
  });
});
