import type { Database } from '../db/connection.js';
import type { MetadataEvent } from '../sources/types.js';
import type { EventProcessor, ProcessResult, ProcessedResult } from './types.js';
import { reconstructFromMetadata } from './metadata.js';

/**
 * Generic event processing pipeline.
 *
 * 1. Sort into chain order (blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC)
 * 2. For each event:
 *    a. Reconstruct metadata (unchunk strings, restore nulls)
 *    b. Zod schema validate (via processor.schema)
 *    c. verify() — signature verification via EventProcessor (returns VerifyResult)
 *    d. validateChain?() — domain-specific chain validation (optional)
 *    e. Merge verify + validateChain into ProcessedResult (Audit Fix #25)
 *    f. makeRow() + INSERT immediately (so later events in the batch can see it)
 *
 * Events are persisted progressively so that chain validation for update/revoke
 * can find the preceding create/update that may be in the same batch.
 */
export async function processEvents(
  db: Database,
  events: MetadataEvent[],
  processor: EventProcessor
): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, valid: 0, invalid: 0, skipped: 0 };

  // Sort into chain order: blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC
  const sorted = [...events].sort((a, b) => {
    if (a.blockHeight !== b.blockHeight) return a.blockHeight - b.blockHeight;
    const aIdx = a.txIndex ?? Number.MAX_SAFE_INTEGER;
    const bIdx = b.txIndex ?? Number.MAX_SAFE_INTEGER;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.txHash.localeCompare(b.txHash);
  });

  for (const raw of sorted) {
    result.processed++;

    // Step 1: Reconstruct metadata from Cardano chunked format
    const reconstructed = reconstructFromMetadata(raw.jsonMetadata);

    // Step 2: Zod schema validate
    const parseResult = processor.schema.safeParse(reconstructed);
    if (!parseResult.success) {
      const processedResult: ProcessedResult = {
        valid: false,
        validationError: 'schema_invalid',
        verifyResult: { valid: false, error: 'schema_invalid' },
      };
      await insertRow(db, processor, processor.makeRow(raw, reconstructed, processedResult), result);
      result.invalid++;
      continue;
    }

    const event = parseResult.data;

    // Step 3: Signature verification via EventProcessor
    let verifyResult;
    try {
      verifyResult = await processor.verify(event);
    } catch {
      verifyResult = { valid: false, error: 'verify_exception' } as const;
    }

    // Step 4: Domain-specific chain validation (optional)
    const chainResult = await processor.validateChain?.(db, event, raw.txHash)
      ?? { valid: true };

    // Step 5: Merge into ProcessedResult (Audit Fix #25)
    const processedResult: ProcessedResult = {
      valid: verifyResult.valid && chainResult.valid,
      validationError: !verifyResult.valid
        ? (verifyResult.error ?? 'verify_failed')
        : (!chainResult.valid ? (chainResult.error ?? 'chain_invalid') : null),
      verifyResult,
    };

    // Step 6: Build row and INSERT immediately
    const row = processor.makeRow(raw, event, processedResult);
    await insertRow(db, processor, row, result);

    if (processedResult.valid) {
      result.valid++;
    } else {
      result.invalid++;
    }
  }

  return result;
}

/** Insert a single row with dedup (ON CONFLICT DO NOTHING on tx_hash). */
async function insertRow(
  db: Database,
  processor: EventProcessor,
  row: Record<string, unknown>,
  result: ProcessResult
) {
  const table = processor.table as any;
  const inserted = await db
    .insert(table)
    .values(row)
    .onConflictDoNothing({ target: table.txHash })
    .returning({ txHash: table.txHash });

  if (inserted.length === 0) {
    result.skipped++;
  }
}
