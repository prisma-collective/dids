import type { ZodSchema } from 'zod';
import type { DIDEvent } from '@prisma-dids/types';
import { verifyDIDEvent } from '@prisma-dids/sdk';
import { didEvents } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import type { MetadataEvent } from '../sources/types.js';
import { reconstructFromMetadata } from './metadata.js';
import { validateDIDChain } from './chain-validator.js';

interface ProcessResult {
  processed: number;
  valid: number;
  invalid: number;
  skipped: number; // dedup conflicts
}

/**
 * Processes a batch of raw metadata events through the verification pipeline:
 * 1. Sort into causal order (block_height asc, then version asc)
 * 2. For each event:
 *    a. Reconstruct metadata (unchunk strings, restore nulls)
 *    b. Zod schema validate
 *    c. Ed25519 signature verification (verifyDIDEvent)
 *    d. DID chain validation (prev linkage, version monotonicity, fork detection)
 *    e. INSERT immediately (so later events in the batch can see it)
 *
 * Events are persisted progressively so that chain validation for update/revoke
 * can find the preceding create/update that may be in the same batch.
 */
export async function processEvents(
  db: Database,
  events: MetadataEvent[],
  schema: ZodSchema
): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, valid: 0, invalid: 0, skipped: 0 };

  // Sort into causal order: ascending block height, then parse version for tie-breaking
  const sorted = [...events].sort((a, b) => {
    if (a.blockHeight !== b.blockHeight) return a.blockHeight - b.blockHeight;
    // Within same block, try to order by version (parsed from metadata)
    const aVersion = extractVersion(a.jsonMetadata);
    const bVersion = extractVersion(b.jsonMetadata);
    return aVersion - bVersion;
  });

  for (const raw of sorted) {
    result.processed++;

    // Step 1: Reconstruct metadata from Cardano chunked format
    const reconstructed = reconstructFromMetadata(raw.jsonMetadata);

    // Step 2: Zod schema validate
    const parseResult = schema.safeParse(reconstructed);
    if (!parseResult.success) {
      await insertRow(db, makeRow(raw, reconstructed, false, 'schema_invalid'), result);
      result.invalid++;
      continue;
    }

    const event = parseResult.data as DIDEvent;

    // Step 3: Ed25519 signature verification
    let sigValid: boolean;
    try {
      sigValid = await verifyDIDEvent(event);
    } catch {
      sigValid = false;
    }

    if (!sigValid) {
      await insertRow(db, makeRow(raw, reconstructed, false, 'bad_signature'), result);
      result.invalid++;
      continue;
    }

    // Step 4: DID chain validation (queries DB — earlier batch events are already persisted)
    const chainResult = await validateDIDChain(db, event, raw.txHash);
    if (!chainResult.valid) {
      await insertRow(db, makeRow(raw, reconstructed, false, chainResult.error!), result);
      result.invalid++;
      continue;
    }

    // Step 5: INSERT immediately so subsequent events can reference this one
    await insertRow(db, makeRow(raw, reconstructed, true, null), result);
    result.valid++;
  }

  return result;
}

/** Insert a single row with dedup (ON CONFLICT DO NOTHING on tx_hash). */
async function insertRow(
  db: Database,
  row: typeof didEvents.$inferInsert,
  result: ProcessResult
) {
  const inserted = await db
    .insert(didEvents)
    .values(row)
    .onConflictDoNothing({ target: didEvents.txHash })
    .returning({ txHash: didEvents.txHash });

  if (inserted.length === 0) {
    result.skipped++;
  }
}

/** Best-effort version extraction from raw metadata for sorting within a block. */
function extractVersion(metadata: unknown): number {
  if (metadata && typeof metadata === 'object' && 'v' in metadata) {
    return Number((metadata as any).v) || 0;
  }
  return 0;
}

function makeRow(
  raw: MetadataEvent,
  reconstructed: unknown,
  valid: boolean,
  validationError: string | null
): typeof didEvents.$inferInsert {
  const event = reconstructed as Record<string, unknown>;
  return {
    did: String(event.id ?? ''),
    txHash: raw.txHash,
    action: String(event.action ?? ''),
    version: Number(event.v ?? 0),
    prevTxHash: event.prev ? String(event.prev) : null,
    ipfsCid: event.ipfs ? String(event.ipfs) : null,
    valid,
    validationError,
    confirmed: false,
    blockHeight: raw.blockHeight,
    timestamp: new Date(raw.blockTime * 1000),
    rawEvent: JSON.stringify(raw.jsonMetadata),
  };
}
