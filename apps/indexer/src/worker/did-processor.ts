import { DIDEventSchema } from '@prisma-events/dids-types';
import type { DIDEvent, PrismaPayloadSig } from '@prisma-events/dids-types';
import { verifyCoseSign1Signature, utf8ToBytes } from '@prisma-events/dids-sdk';
import { didEvents } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import type { MetadataEvent } from '../sources/types.js';
import type { EventProcessor, VerifyResult, ProcessedResult } from './types.js';
import { validateDIDChain } from './chain-validator.js';

/**
 * DID event processor — implements EventProcessor for L_DID (199674).
 *
 * verify():
 *   1. COSE_Sign1 cryptographic validity
 *   2. Payload binding — signed content matches event fields (anti-tamper)
 *   3. Signer stake address matches DID controller
 * validateChain(): prev-linkage, version monotonicity, fork detection
 * makeRow(): maps DID event fields to did_events table columns
 */
export const didEventProcessor: EventProcessor = {
  table: didEvents,
  schema: DIDEventSchema,

  async verify(event: unknown): Promise<VerifyResult> {
    const didEvent = event as DIDEvent;
    try {
      const payloadSig: PrismaPayloadSig = JSON.parse(didEvent.payloadSig);
      const coseResult = await verifyCoseSign1Signature(payloadSig);

      if (!coseResult.valid || !coseResult.signerStakeAddress || !coseResult.signedPayload) {
        return { valid: false, error: coseResult.error ?? 'cose_verify_failed' };
      }

      // Payload binding: signed bytes must match the event's content fields.
      // signDIDPayload() signs JSON.stringify({id, ipfs, action, v, prev}).
      const expectedPayload = JSON.stringify({
        id: didEvent.id,
        ipfs: didEvent.ipfs,
        action: didEvent.action,
        v: didEvent.v,
        prev: didEvent.prev,
      });
      const expectedBytes = utf8ToBytes(expectedPayload);
      if (!bytesEqual(coseResult.signedPayload, expectedBytes)) {
        return {
          valid: false,
          signerStakeAddress: coseResult.signerStakeAddress,
          error: 'payload_mismatch',
        };
      }

      // DID controller check: signer stake address must match DID's stake address
      const stakeAddressFromDid = didEvent.id.replace('did:cardano:', '');
      if (stakeAddressFromDid !== coseResult.signerStakeAddress) {
        return {
          valid: false,
          signerStakeAddress: coseResult.signerStakeAddress,
          error: 'signer_not_controller',
        };
      }

      return { valid: true, signerStakeAddress: coseResult.signerStakeAddress };
    } catch {
      return { valid: false, error: 'verify_exception' };
    }
  },

  async validateChain(db: Database, event: unknown, txHash: string) {
    return validateDIDChain(db, event as DIDEvent, txHash);
  },

  makeRow(raw: MetadataEvent, reconstructed: unknown, processedResult: ProcessedResult) {
    const event = reconstructed as Record<string, unknown>;
    return {
      did: String(event.id ?? ''),
      txHash: raw.txHash,
      action: String(event.action ?? ''),
      version: Number(event.v ?? 0),
      prevTxHash: event.prev ? String(event.prev) : null,
      ipfsCid: event.ipfs ? String(event.ipfs) : null,
      valid: processedResult.valid,
      validationError: processedResult.validationError,
      confirmed: false,
      blockHeight: raw.blockHeight,
      timestamp: new Date(raw.blockTime * 1000),
      rawEvent: JSON.stringify(raw.jsonMetadata),
    };
  },
};

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
