import { eq, and, gte, sql } from 'drizzle-orm';
import { syncState } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import type { MetadataSource } from '../sources/types.js';
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
export class Poller {
  private running = false;
  private polling = false; // Mutex to prevent overlapping polls
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Database,
    private source: MetadataSource,
    private config: ResolvedIndexerConfig
  ) {}

  start() {
    if (this.running) return;
    this.running = true;

    const interval = this.config.pollIntervalMs ?? 30_000;
    console.log(`Poller starting (interval: ${interval}ms, labels: ${this.config.labels.join(', ')})`);

    // Immediate first poll
    this.poll();

    this.timer = setInterval(() => this.poll(), interval);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('Poller stopped.');
  }

  private async poll() {
    if (this.polling) {
      console.log('Poll skipped — previous cycle still running.');
      return;
    }
    this.polling = true;

    try {
      for (const label of this.config.labels) {
        await this.pollLabel(label);
      }
      await this.runConfirmationPass();
    } catch (err) {
      console.error('Poll cycle error:', err);
    } finally {
      this.polling = false;
    }
  }

  private async pollLabel(label: number) {
    const processor = this.config.processors[label];
    if (!processor) {
      console.warn(`No processor for label ${label}, skipping.`);
      return;
    }

    // Get or create sync state for this label
    let checkpoint = await this.getCheckpoint(label);
    const checkpointHeight = checkpoint?.lastBlockHeight ?? 0;
    const checkpointHash = checkpoint?.lastBlockHash ?? null;

    // --- Rollback detection ---
    if (checkpointHeight > 0 && checkpointHash) {
      const block = await this.source.getBlockByHeight(checkpointHeight);
      if (block && block.hash !== checkpointHash) {
        console.warn(
          `REORG DETECTED at height ${checkpointHeight}: ` +
          `expected ${checkpointHash}, got ${block.hash}. Invalidating events.`
        );
        await this.handleReorg(checkpointHeight);
        // Re-fetch checkpoint after reorg handling
        checkpoint = await this.getCheckpoint(label);
      }
    }

    const currentCheckpoint = checkpoint?.lastBlockHeight ?? 0;
    const isInitialSync = currentCheckpoint === 0;

    if (isInitialSync) {
      await this.initialSync(label, processor);
    } else {
      await this.incrementalPoll(label, processor, currentCheckpoint);
    }
  }

  /**
   * Initial sync: order=asc, page through all history chronologically.
   */
  private async initialSync(label: number, processor: EventProcessor) {
    console.log(`Initial sync for label ${label}...`);
    let page = 1;
    let totalProcessed = 0;
    let lastBlockHeight = 0;
    let lastBlockHash = '';

    while (true) {
      const events = await this.source.listLabelEvents(label, 'asc', page, PAGE_SIZE);
      if (events.length === 0) break;

      const result = await processEvents(this.db, events, processor);
      totalProcessed += result.processed;

      // Track the highest block we've seen
      const lastEvent = events[events.length - 1]!;
      lastBlockHeight = lastEvent.blockHeight;
      lastBlockHash = lastEvent.blockHash;

      // Update checkpoint after each page
      await this.updateCheckpoint(label, lastBlockHeight, lastBlockHash);

      if (events.length < PAGE_SIZE) break; // Last page
      page++;
    }

    console.log(`Initial sync complete for label ${label}: ${totalProcessed} events processed.`);
  }

  /**
   * Incremental poll: order=desc (newest first), process events where
   * block_height > checkpoint. Re-insert at == checkpoint (idempotent).
   * Stop when block_height < checkpoint.
   */
  private async incrementalPoll(
    label: number,
    processor: EventProcessor,
    checkpointHeight: number
  ) {
    let page = 1;
    let totalProcessed = 0;
    let newHighestHeight = checkpointHeight;
    let newHighestHash = '';
    let done = false;

    while (!done) {
      const events = await this.source.listLabelEvents(label, 'desc', page, PAGE_SIZE);
      if (events.length === 0) break;

      // Filter: process events >= checkpoint height (idempotent at ==)
      const toProcess = [];
      for (const event of events) {
        if (event.blockHeight > checkpointHeight) {
          toProcess.push(event);
          if (event.blockHeight > newHighestHeight) {
            newHighestHeight = event.blockHeight;
            newHighestHash = event.blockHash;
          }
        } else if (event.blockHeight === checkpointHeight) {
          // Re-insert idempotently (dedup via tx_hash UNIQUE)
          toProcess.push(event);
        } else {
          // block_height < checkpoint → stop
          done = true;
          break;
        }
      }

      if (toProcess.length > 0) {
        const result = await processEvents(this.db, toProcess, processor);
        totalProcessed += result.processed;
      }

      if (events.length < PAGE_SIZE) break; // Last page
      page++;
    }

    // Update checkpoint if we found new blocks
    if (newHighestHeight > checkpointHeight && newHighestHash) {
      await this.updateCheckpoint(label, newHighestHeight, newHighestHash);
    }

    if (totalProcessed > 0) {
      console.log(`Incremental poll for label ${label}: ${totalProcessed} events processed.`);
    }
  }

  /**
   * Confirmation pass: mark events as confirmed when
   * chain_tip - block_height >= confirmationDepth.
   * Iterates all processor tables.
   */
  private async runConfirmationPass() {
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
    hash: string | null
  ) {
    await this.db
      .insert(syncState)
      .values({
        label,
        lastBlockHeight: height,
        lastBlockHash: hash,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: syncState.label,
        set: {
          lastBlockHeight: height,
          lastBlockHash: hash,
          updatedAt: new Date(),
        },
      });
  }
}
