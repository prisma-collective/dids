import { eq, and, gte, sql, inArray } from 'drizzle-orm';
import { syncState } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import type { MetadataSource, MetadataEvent } from '../sources/types.js';
import type { ResolvedIndexerConfig } from '../config/types.js';
import type { EventProcessor } from './types.js';
import { processEvents } from './processor.js';

const PAGE_SIZE = 100;

/**
 * Polling worker using block-height boundary logic.
 *
 * - Incremental: order=desc, process events where block_height > checkpoint,
 *   re-insert at == checkpoint (idempotent via tx_hash UNIQUE), stop at < checkpoint.
 * - Initial sync: checkpoint=0, all events qualify. Page through with order=asc once.
 * - Rollback detection: compare stored block hash with chain state on each cycle.
 * - Confirmation pass: mark events confirmed when block_height + depth <= chain tip.
 *
 * Uses ResolvedIndexerConfig.processors to dispatch events to the correct
 * EventProcessor per label. No hardcoded table references.
 */
const BACKOFF_MULTIPLIER = 1.5; // 30s → 45s → 67s → 101s → 151s → 180s (cap)
const BACKOFF_CAP_MS = 180_000; // 3 min max

export class Poller {
  private running = false;
  private polling = false; // Mutex to prevent overlapping polls
  private pollTimeout: ReturnType<typeof setTimeout> | null = null;
  private confirmTimer: ReturnType<typeof setInterval> | null = null;
  private idleCycles = 0; // Consecutive cycles with no new events
  private pollCycle = 0; // Total cycles, used for periodic rollback
  private baseInterval: number = 30_000;
  private firstPoll = true; // Skip heartbeat on first poll after startup

  constructor(
    private db: Database,
    private source: MetadataSource,
    private config: ResolvedIndexerConfig
  ) {}

  start() {
    if (this.running) return;
    this.running = true;

    this.baseInterval = this.config.pollIntervalMs ?? 30_000;
    const confirmInterval = Math.max(this.baseInterval * 6, 3 * 60_000);
    console.log(`Poller starting (base: ${this.baseInterval}ms, confirm: ${confirmInterval}ms, labels: ${this.config.labels.join(', ')})`);

    // Immediate first poll + confirmation
    this.poll();
    this.runConfirmationPass().catch(err => console.error('Confirmation pass error:', err));

    this.confirmTimer = setInterval(
      () => this.runConfirmationPass().catch(err => console.error('Confirmation pass error:', err)),
      confirmInterval
    );
  }

  stop() {
    this.running = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    if (this.confirmTimer) {
      clearInterval(this.confirmTimer);
      this.confirmTimer = null;
    }
    console.log('Poller stopped.');
  }

  /** Adaptive interval: base * 1.5^idleCycles, capped at max(3 min, baseInterval). */
  private get currentInterval(): number {
    const backoff = this.baseInterval * Math.pow(BACKOFF_MULTIPLIER, this.idleCycles);
    const cap = Math.max(BACKOFF_CAP_MS, this.baseInterval); // Never poll faster than config
    return Math.min(Math.round(backoff), cap);
  }

  private scheduleNext() {
    if (!this.running) return;
    this.pollTimeout = setTimeout(() => this.poll(), this.currentInterval);
  }

  private async poll() {
    if (this.polling) {
      this.scheduleNext();
      return;
    }
    this.polling = true;

    let foundNew = false;
    this.pollCycle++;
    try {
      for (const label of this.config.labels) {
        const processed = await this.pollLabel(label);
        if (processed > 0) foundNew = true;
      }
    } catch (err) {
      console.error('Poll cycle error:', err);
    } finally {
      this.firstPoll = false;
      // Adaptive backoff: reset on new events, increase on idle
      if (foundNew) {
        if (this.idleCycles > 0) {
          console.log(`Poller: new events found, resetting backoff (was ${this.currentInterval}ms).`);
        }
        this.idleCycles = 0;
      } else {
        this.idleCycles++;
      }
      this.polling = false;
      this.scheduleNext();
    }
  }

  /** Returns count of processed events (0 = nothing new). */
  private async pollLabel(label: number): Promise<number> {
    const processor = this.config.processors[label];
    if (!processor) {
      console.warn(`No processor for label ${label}, skipping.`);
      return 0;
    }

    // Get or create sync state for this label
    let checkpoint = await this.getCheckpoint(label);
    const checkpointHeight = checkpoint?.lastBlockHeight ?? 0;
    const checkpointHash = checkpoint?.lastBlockHash ?? null;

    const currentCheckpoint = checkpoint?.lastBlockHeight ?? 0;
    const isInitialSync = currentCheckpoint === 0;

    if (isInitialSync) {
      return this.initialSync(label, processor);
    }

    // --- Label-head heartbeat: skip full scan if nothing new ---
    // Always do a full scan on first poll after startup to catch events
    // that may have been missed if the previous instance crashed mid-cycle.
    let labelChanged: boolean;
    if (this.firstPoll) {
      labelChanged = true;
    } else {
      const headTxHash = checkpoint?.lastTxHash ?? null;
      labelChanged = !headTxHash; // If no stored hash, assume changed (first run after upgrade)
      if (headTxHash) {
        const head = await this.source.listRawLabelEvents(label, 'desc', 1, 1);
        if (head.length > 0 && head[0]!.txHash === headTxHash) {
          labelChanged = false;
        } else {
          labelChanged = true;
        }
      }
    }

    // --- Rollback detection: every 10th cycle OR when label-head changed ---
    if (checkpointHeight > 0 && checkpointHash && (labelChanged || this.pollCycle % 10 === 0)) {
      const block = await this.source.getBlockByHeight(checkpointHeight);
      if (block && block.hash !== checkpointHash) {
        console.warn(
          `REORG DETECTED at height ${checkpointHeight}: ` +
          `expected ${checkpointHash}, got ${block.hash}. Invalidating events.`
        );
        await this.handleReorg(checkpointHeight);
        checkpoint = await this.getCheckpoint(label);
      }
    }

    if (!labelChanged) return 0; // Nothing new — skip incremental scan

    return this.incrementalPoll(label, processor, checkpoint?.lastBlockHeight ?? 0, checkpoint?.lastBlockHash ?? null);
  }

  /**
   * Initial sync: order=asc, page through all history chronologically.
   */
  private async initialSync(label: number, processor: EventProcessor): Promise<number> {
    console.log(`Initial sync for label ${label}...`);
    const ENRICH_CHUNK = 5;
    let page = 1;
    let totalProcessed = 0;
    let lastBlockHeight = 0;
    let lastBlockHash = '';
    let lastTxHash: string | null = null;

    while (true) {
      // Use raw list + chunked enrichment (same as incremental) to avoid N+1
      const rawEvents = await this.source.listRawLabelEvents(label, 'asc', page, PAGE_SIZE);
      if (rawEvents.length === 0) break;

      // Enrich all events in chunks (during initial sync, everything is new)
      const enriched: MetadataEvent[] = [];
      for (let i = 0; i < rawEvents.length; i += ENRICH_CHUNK) {
        const chunk = rawEvents.slice(i, i + ENRICH_CHUNK);
        const details = await Promise.all(
          chunk.map(raw => this.source.getTxDetails(raw.txHash))
        );
        for (let j = 0; j < chunk.length; j++) {
          const raw = chunk[j]!;
          const detail = details[j]!;
          enriched.push({
            txHash: raw.txHash,
            txIndex: detail.txIndex,
            blockHeight: detail.blockHeight,
            blockHash: detail.blockHash,
            blockTime: detail.blockTime,
            jsonMetadata: raw.jsonMetadata,
          });
        }
      }

      const result = await processEvents(this.db, enriched, processor);
      totalProcessed += result.processed;

      // Track the highest block we've seen
      const lastEvent = enriched[enriched.length - 1]!;
      lastBlockHeight = lastEvent.blockHeight;
      lastBlockHash = lastEvent.blockHash;
      lastTxHash = enriched[0]!.txHash; // Will be overwritten; final value is from last page

      // Update checkpoint after each page
      await this.updateCheckpoint(label, lastBlockHeight, lastBlockHash);

      if (rawEvents.length < PAGE_SIZE) break; // Last page
      page++;
    }

    // Seed lastTxHash so heartbeat works immediately after initial sync
    if (totalProcessed > 0) {
      const head = await this.source.listRawLabelEvents(label, 'desc', 1, 1);
      lastTxHash = head.length > 0 ? head[0]!.txHash : lastTxHash;
      await this.updateCheckpoint(label, lastBlockHeight, lastBlockHash, lastTxHash);
    }

    console.log(`Initial sync complete for label ${label}: ${totalProcessed} events processed.`);
    return totalProcessed;
  }

  /**
   * Incremental poll: order=desc (newest first).
   * Uses raw label events (no enrichment) + DB dedup to avoid N+1 API calls.
   * Only enriches genuinely new events in chunked Promise.all batches.
   */
  private async incrementalPoll(
    label: number,
    processor: EventProcessor,
    checkpointHeight: number,
    checkpointHash: string | null = null
  ): Promise<number> {
    const table = processor.table as any;
    const ENRICH_CHUNK = 5;
    let page = 1;
    let totalProcessed = 0;
    let newHighestHeight = checkpointHeight;
    let newHighestHash = '';
    let headTxHash: string | null = null; // Track newest tx for heartbeat

    while (true) {
      // Step 1: Fetch raw events — 1 API call, no enrichment
      const rawEvents = await this.source.listRawLabelEvents(label, 'desc', page, PAGE_SIZE);
      if (rawEvents.length === 0) break;

      // Capture the newest tx_hash (first on page 1, desc order) for heartbeat
      if (page === 1) headTxHash = rawEvents[0]!.txHash;

      // Step 2: DB dedup — find which tx_hashes we already have
      const txHashes = rawEvents.map(e => e.txHash);
      const existing = await this.db
        .select({ txHash: table.txHash })
        .from(table)
        .where(inArray(table.txHash, txHashes));
      const knownSet = new Set(existing.map((r: any) => r.txHash));

      // Step 3: Filter to new events only
      const newRaw = rawEvents.filter(e => !knownSet.has(e.txHash));

      // Step 4: Enrich + process new events (skip if all known)
      if (newRaw.length > 0) {
        const enriched: MetadataEvent[] = [];
        for (let i = 0; i < newRaw.length; i += ENRICH_CHUNK) {
          const chunk = newRaw.slice(i, i + ENRICH_CHUNK);
          const details = await Promise.all(
            chunk.map(raw => this.source.getTxDetails(raw.txHash))
          );
          for (let j = 0; j < chunk.length; j++) {
            const raw = chunk[j]!;
            const detail = details[j]!;
            enriched.push({
              txHash: raw.txHash,
              txIndex: detail.txIndex,
              blockHeight: detail.blockHeight,
              blockHash: detail.blockHash,
              blockTime: detail.blockTime,
              jsonMetadata: raw.jsonMetadata,
            });
          }
        }

        const result = await processEvents(this.db, enriched, processor);
        totalProcessed += result.processed;

        // Track highest block for checkpoint
        for (const event of enriched) {
          if (event.blockHeight > newHighestHeight) {
            newHighestHeight = event.blockHeight;
            newHighestHash = event.blockHash;
          }
        }
      }

      // Step 5: Checkpoint-aware pagination — use block height, not dedup, as stop condition.
      // After a crash, events may be in the DB but the checkpoint wasn't updated.
      // We must keep paging until we reach events at/below the checkpoint height.
      if (rawEvents.length < PAGE_SIZE) break; // Last page from API

      if (newRaw.length === rawEvents.length) {
        // All events were new — definitely continue
        page++;
        continue;
      }

      // Partial or zero new events: check if oldest event on this page (last in desc order)
      // has reached the checkpoint boundary. Avoids re-enriching if already known.
      const oldestOnPage = rawEvents[rawEvents.length - 1]!;
      const oldestDetail = await this.source.getTxDetails(oldestOnPage.txHash);
      if (oldestDetail.blockHeight <= checkpointHeight) {
        break; // Reached/passed checkpoint boundary — safe to stop
      }
      page++;
    }

    // Update checkpoint: always write headTxHash so heartbeat stays seeded
    if (newHighestHeight > checkpointHeight && newHighestHash) {
      await this.updateCheckpoint(label, newHighestHeight, newHighestHash, headTxHash);
    } else if (headTxHash) {
      // No new blocks, but seed/update the heartbeat tx hash (preserve existing block hash)
      await this.updateCheckpoint(label, checkpointHeight, checkpointHash, headTxHash);
    }

    if (totalProcessed > 0) {
      console.log(`Incremental poll for label ${label}: ${totalProcessed} events processed.`);
    }

    return totalProcessed;
  }

  /**
   * Confirmation pass: mark events as confirmed when
   * chain_tip - block_height >= confirmationDepth.
   * Decoupled from poll cycle — runs on its own cadence.
   * Skips the chain tip API call if no unconfirmed rows exist.
   */
  private async runConfirmationPass() {
    // Pre-check: any unconfirmed rows? If not, skip entirely (0 API calls)
    let hasUnconfirmed = false;
    for (const [, processor] of Object.entries(this.config.processors)) {
      const table = processor.table as any;
      const check = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(eq(table.confirmed, false));
      if ((check[0]?.count ?? 0) > 0) {
        hasUnconfirmed = true;
        break;
      }
    }
    if (!hasUnconfirmed) return;

    const depth = this.config.confirmationDepth ?? 112;
    const chainTip = await this.source.getChainTip();
    const confirmBelow = chainTip - depth;

    if (confirmBelow <= 0) return;

    for (const [, processor] of Object.entries(this.config.processors)) {
      const table = processor.table as any;
      const result = await this.db
        .update(table)
        .set({
          confirmed: true,
          confirmedAtHeight: chainTip,
        })
        .where(
          and(
            eq(table.confirmed, false),
            sql`${table.blockHeight} <= ${confirmBelow}`
          )
        )
        .returning({ txHash: table.txHash });

      if (result.length > 0) {
        console.log(`Confirmation pass: ${result.length} events confirmed (tip=${chainTip}, depth=${depth}).`);
      }
    }
  }

  /**
   * Handle chain reorg: DELETE events at or above the reorg height.
   * We delete rather than mark invalid so that re-included tx_hashes
   * (same tx reappearing after reorg) can be re-inserted cleanly
   * instead of being silently skipped by onConflictDoNothing.
   * Iterates all processor tables.
   */
  private async handleReorg(reorgHeight: number) {
    let totalDeleted = 0;

    // Per-label reorg: each label's checkpoint is reset to its own table's
    // last valid height, not a global max across all tables.
    for (const [labelStr, processor] of Object.entries(this.config.processors)) {
      const label = Number(labelStr);
      const table = processor.table as any;

      const deleted = await this.db
        .delete(table)
        .where(gte(table.blockHeight, reorgHeight))
        .returning({ txHash: table.txHash });

      totalDeleted += deleted.length;

      // Find this label's last valid block below reorgHeight
      const lastValid = await this.db
        .select({ blockHeight: table.blockHeight })
        .from(table)
        .where(
          and(
            eq(table.valid, true),
            sql`${table.blockHeight} < ${reorgHeight}`
          )
        )
        .orderBy(sql`${table.blockHeight} DESC`)
        .limit(1);

      const newHeight = lastValid[0]?.blockHeight ?? 0;
      const block = newHeight > 0 ? await this.source.getBlockByHeight(newHeight) : null;

      await this.updateCheckpoint(label, newHeight, block?.hash ?? null);
      console.warn(`Reorg: label ${label} checkpoint reset to height ${newHeight}.`);
    }

    console.warn(`Reorg: deleted ${totalDeleted} events at height >= ${reorgHeight}.`);
  }

  private async getCheckpoint(label: number) {
    const rows = await this.db
      .select()
      .from(syncState)
      .where(eq(syncState.label, label))
      .limit(1);

    return rows[0] ?? null;
  }

  private async updateCheckpoint(
    label: number,
    height: number,
    hash: string | null,
    txHash?: string | null
  ) {
    await this.db
      .insert(syncState)
      .values({
        label,
        lastBlockHeight: height,
        lastBlockHash: hash,
        ...(txHash !== undefined && { lastTxHash: txHash }),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: syncState.label,
        set: {
          lastBlockHeight: height,
          lastBlockHash: hash,
          ...(txHash !== undefined && { lastTxHash: txHash }),
          updatedAt: new Date(),
        },
      });
  }
}
