import { VCEventPayloadSchema } from '@prisma-dids/schemas';
import type { VCEventPayload } from '@prisma-dids/schemas';
import type { PrismaPayloadSig } from '@prisma-dids/types';
import { verifyCoseSign1Signature } from '@prisma-dids/sdk';
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
 *      - issue  → anchor payload binding + signer must match issuerDid
 *                 (legacy: pre-F-META-01 events signed credential payload)
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
          const issuerStake = vcEvent.issuerDid.replace('did:cardano:', '');
          if (issuerStake !== coseResult.signerStakeAddress) {
            return {
              valid: false,
              signerStakeAddress: coseResult.signerStakeAddress,
              error: 'signer_not_issuer',
            };
          }

          const expectedIssue = buildExpectedIssueAnchor(vcEvent);
          if (jsonPayloadMatch(coseResult.signedPayload, expectedIssue)) {
            return { valid: true, signerStakeAddress: coseResult.signerStakeAddress };
          }

          // Legacy (pre-F-META-01): payloadSig signed the credential claims, not anchor fields.
          if (isLegacyCredentialSignedPayload(coseResult.signedPayload)) {
            return { valid: true, signerStakeAddress: coseResult.signerStakeAddress };
          }

          return {
            valid: false,
            signerStakeAddress: coseResult.signerStakeAddress,
            error: 'payload_mismatch',
          };
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

          const expectedValidate: Record<string, unknown> = {
            event: vcEvent.event,
            issuerDid: vcEvent.issuerDid,
            holderDid: vcEvent.holderDid,
            vcHash: vcEvent.vcHash,
            vcType: vcEvent.vcType,
            vcFormat: vcEvent.vcFormat,
            validatorDid: vcEvent.validatorDid,
            ...(vcEvent.reason !== undefined && { reason: vcEvent.reason }),
            ts: vcEvent.ts,
          };
          if (!jsonPayloadMatch(coseResult.signedPayload, expectedValidate)) {
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
          const expectedRevoke: Record<string, unknown> = {
            event: vcEvent.event,
            issuerDid: vcEvent.issuerDid,
            holderDid: vcEvent.holderDid,
            vcHash: vcEvent.vcHash,
            vcType: vcEvent.vcType,
            vcFormat: vcEvent.vcFormat,
            ...(vcEvent.reason !== undefined && { reason: vcEvent.reason }),
            ts: vcEvent.ts,
          };
          if (!jsonPayloadMatch(coseResult.signedPayload, expectedRevoke)) {
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

/** Expected signed payload for issue anchor events (F-META-01). ipfsCid is not signed. */
export function buildExpectedIssueAnchor(vcEvent: VCEventPayload): Record<string, unknown> {
  return {
    event: vcEvent.event,
    issuerDid: vcEvent.issuerDid,
    holderDid: vcEvent.holderDid,
    vcHash: vcEvent.vcHash,
    vcType: vcEvent.vcType,
    vcFormat: vcEvent.vcFormat,
    ts: vcEvent.ts,
  };
}

/** Pre-F-META-01 issue events signed the credential JSON (iss/vct/_sd), not anchor fields. */
export function isLegacyCredentialSignedPayload(signedPayload: Uint8Array): boolean {
  try {
    const signed = JSON.parse(new TextDecoder().decode(signedPayload)) as Record<string, unknown>;
    return 'vct' in signed || 'iss' in signed || '_sd' in signed || 'jti' in signed;
  } catch {
    return false;
  }
}

/**
 * Order-independent JSON payload comparison.
 * Parses signed COSE payload bytes as JSON and compares each key-value pair
 * against the expected object. This avoids false `payload_mismatch` errors
 * caused by JSON.stringify field-order differences between signing and verification.
 */
export function jsonPayloadMatch(
  signedPayload: Uint8Array,
  expected: Record<string, unknown>,
): boolean {
  try {
    const signedStr = new TextDecoder().decode(signedPayload);
    const signed = JSON.parse(signedStr) as Record<string, unknown>;
    const expectedKeys = Object.keys(expected);
    const signedKeys = Object.keys(signed);
    if (expectedKeys.length !== signedKeys.length) return false;
    return expectedKeys.every((key) => signed[key] === expected[key]);
  } catch {
    return false;
  }
}
