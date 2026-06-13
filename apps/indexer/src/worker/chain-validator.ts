import { eq, and } from 'drizzle-orm';
import { didEvents } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import type { DIDEvent } from '@prisma-events/dids-types';

export interface ChainValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates DID chain integrity for a single event.
 *
 * Rules (per TECHNICAL_DESIGN §5):
 * - `create` must be v=1, prev=null, and no prior create exists for this DID
 * - `update`/`revoke` must have prev pointing to a known, valid tx_hash for the same DID
 * - Version must be strictly greater than the previous event's version for that DID
 * - No forks: two events for the same DID cannot share the same prev_tx_hash
 */
export async function validateDIDChain(
  db: Database,
  event: DIDEvent,
  txHash: string
): Promise<ChainValidationResult> {
  const did = event.id;

  if (event.action === 'create') {
    // create must be v=1
    if (event.v !== 1) {
      return { valid: false, error: 'create_version_not_1' };
    }

    // create must have prev=null
    if (event.prev !== null) {
      return { valid: false, error: 'create_has_prev' };
    }

    // No prior create should exist for this DID
    const existing = await db
      .select({ txHash: didEvents.txHash })
      .from(didEvents)
      .where(
        and(
          eq(didEvents.did, did),
          eq(didEvents.action, 'create'),
          eq(didEvents.valid, true)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return { valid: false, error: 'duplicate_create' };
    }

    return { valid: true };
  }

  // update or revoke
  if (event.prev === null) {
    return { valid: false, error: 'missing_prev' };
  }

  // prev must point to a known, valid tx for the same DID
  const prevEvent = await db
    .select({
      version: didEvents.version,
      did: didEvents.did,
    })
    .from(didEvents)
    .where(
      and(
        eq(didEvents.txHash, event.prev),
        eq(didEvents.did, did),
        eq(didEvents.valid, true)
      )
    )
    .limit(1);

  if (prevEvent.length === 0) {
    return { valid: false, error: 'broken_chain' };
  }

  // Version must be strictly greater than prev
  if (event.v <= prevEvent[0]!.version) {
    return { valid: false, error: 'version_not_increasing' };
  }

  // Fork detection: no other valid event should share the same prev_tx_hash for this DID
  const forkCheck = await db
    .select({ txHash: didEvents.txHash })
    .from(didEvents)
    .where(
      and(
        eq(didEvents.prevTxHash, event.prev),
        eq(didEvents.did, did),
        eq(didEvents.valid, true)
      )
    )
    .limit(1);

  if (forkCheck.length > 0) {
    return { valid: false, error: 'fork_detected' };
  }

  return { valid: true };
}
