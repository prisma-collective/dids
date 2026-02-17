import { VCEventPayloadSchema } from '@prisma-dids/schemas';
import type { VCEventPayload } from '@prisma-dids/schemas';
import type { PrismaPayloadSig } from '@prisma-dids/types';
import { verifyCoseSign1Signature, utf8ToBytes } from '@prisma-dids/sdk';
import { vcEvents } from '../db/schema.js';
import type { MetadataEvent } from '../sources/types.js';
import type { EventProcessor, VerifyResult, ProcessedResult } from './types.js';

/**
 * VC event processor — implements EventProcessor for L_VC (199675).
 *
 * verify():
 *   1. COSE_Sign1 cryptographic validity
 *   2. Payload binding — signed content matches event fields (anti-tamper)
 *   3. Event-type-aware signer matching (Audit Fix #19):
 *      - issue  → signer must match issuerDid
 *      - validate → validatorDid required + signer must match validatorDid
 *      - revoke → COSE validity only (authorization deferred to reducer, Audit Fix #20)
 *
 * validateChain(): none — VC events are independent (no prev pointer chain)
 * makeRow(): maps VCEventPayload fields to vc_events table columns
 */
export const vcEventProcessor: EventProcessor = {
  table: vcEvents,
  schema: VCEventPayloadSchema,

  async verify(event: unknown): Promise<VerifyResult> {
    const vcEvent = event as VCEventPayload;
    try {
      const payloadSig: PrismaPayloadSig = JSON.parse(vcEvent.payloadSig);
      const coseResult = await verifyCoseSign1Signature(payloadSig);

      if (!coseResult.valid || !coseResult.signerStakeAddress || !coseResult.signedPayload) {
        return { valid: false, error: coseResult.error ?? 'cose_verify_failed' };
      }

      // Event-type-aware verification (Audit Fix #19)
      switch (vcEvent.event) {
        case 'issue': {
          // Issue events reuse the credential's payloadSig (signed credential payload,
          // not anchor fields). Payload binding is skipped — COSE validity + signer
          // matching is sufficient. The credential payload was signed by the issuer's
          // wallet via signData, proving identity.
          const issuerStake = vcEvent.issuerDid.replace('did:cardano:', '');
          if (issuerStake !== coseResult.signerStakeAddress) {
            return {
              valid: false,
              signerStakeAddress: coseResult.signerStakeAddress,
              error: 'signer_not_issuer',
            };
          }
          return { valid: true, signerStakeAddress: coseResult.signerStakeAddress };
        }

        case 'validate': {
          // Validate events sign their own anchor payload — full payload binding required.
          if (!vcEvent.validatorDid) {
            return {
              valid: false,
              signerStakeAddress: coseResult.signerStakeAddress,
              error: 'missing_validator_did',
            };
          }

          const expectedPayload = JSON.stringify({
            event: vcEvent.event,
            issuerDid: vcEvent.issuerDid,
            holderDid: vcEvent.holderDid,
            vcHash: vcEvent.vcHash,
            vcType: vcEvent.vcType,
            vcFormat: vcEvent.vcFormat,
            validatorDid: vcEvent.validatorDid,
            ...(vcEvent.reason !== undefined && { reason: vcEvent.reason }),
            ts: vcEvent.ts,
          });
          const expectedBytes = utf8ToBytes(expectedPayload);
          if (!bytesEqual(coseResult.signedPayload, expectedBytes)) {
            return {
              valid: false,
              signerStakeAddress: coseResult.signerStakeAddress,
              error: 'payload_mismatch',
            };
          }

          const validatorStake = vcEvent.validatorDid.replace('did:cardano:', '');
          if (validatorStake !== coseResult.signerStakeAddress) {
            return {
              valid: false,
              signerStakeAddress: coseResult.signerStakeAddress,
              error: 'signer_not_validator',
            };
          }
          return { valid: true, signerStakeAddress: coseResult.signerStakeAddress };
        }

        case 'revoke': {
          // Revoke events sign their own anchor payload — full payload binding required.
          const expectedPayload = JSON.stringify({
            event: vcEvent.event,
            issuerDid: vcEvent.issuerDid,
            holderDid: vcEvent.holderDid,
            vcHash: vcEvent.vcHash,
            vcType: vcEvent.vcType,
            vcFormat: vcEvent.vcFormat,
            ...(vcEvent.reason !== undefined && { reason: vcEvent.reason }),
            ts: vcEvent.ts,
          });
          const expectedBytes = utf8ToBytes(expectedPayload);
          if (!bytesEqual(coseResult.signedPayload, expectedBytes)) {
            return {
              valid: false,
              signerStakeAddress: coseResult.signerStakeAddress,
              error: 'payload_mismatch',
            };
          }
          // Authorization (signer = canonical issuer) deferred to query-time reducer (Audit Fix #20).
          return { valid: true, signerStakeAddress: coseResult.signerStakeAddress };
        }

        default:
          return { valid: false, error: `unknown_event_type:${vcEvent.event}` };
      }
    } catch {
      return { valid: false, error: 'verify_exception' };
    }
  },

  // VC events are independent — no chain validation needed
  // validateChain is intentionally omitted (undefined → processEvents() defaults to { valid: true })

  makeRow(raw: MetadataEvent, reconstructed: unknown, processedResult: ProcessedResult) {
    const event = reconstructed as Record<string, unknown>;
    return {
      txHash: raw.txHash,
      txIndex: raw.txIndex ?? null,
      event: String(event.event ?? ''),
      issuerDid: String(event.issuerDid ?? ''),
      holderDid: String(event.holderDid ?? ''),
      validatorDid: event.validatorDid ? String(event.validatorDid) : null,
      signerStakeAddress: processedResult.verifyResult.signerStakeAddress ?? null,
      vcHash: String(event.vcHash ?? ''),
      vcType: String(event.vcType ?? ''),
      vcFormat: String(event.vcFormat ?? ''),
      ipfsCid: event.ipfsCid ? String(event.ipfsCid) : null,
      reason: event.reason ? String(event.reason) : null,
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
