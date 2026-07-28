import { z } from 'zod';

/**
 * Allowed revocation reasons (F-META-03 / DP-02).
 * Enum-only — no free text on-chain. All values are well under 128 chars.
 */
export const RevocationReasonEnum = z.enum([
  'issued_in_error',
  'holder_request',
  'policy_violation',
  'expired',
  'compromised',
  'withdrawn_by_holder',
]);

export type RevocationReason = z.infer<typeof RevocationReasonEnum>;

/** Ordered list for UI selects */
export const REVOCATION_REASONS = RevocationReasonEnum.options;

/**
 * On-chain VC event schema (Audit Fix #2).
 * Submitted as Cardano metadata under label L_VC (199675).
 *
 * payloadSig is JSON.stringify({ sig, key, address }) where all three fields
 * are hex strings. `address` is hex-encoded Cardano address bytes (CIP-30 native),
 * NOT bech32 (Audit Fix #7).
 */
export const VCEventPayloadSchema = z.object({
  /** Event type: issue, validate, or revoke */
  event: z.enum(['issue', 'validate', 'revoke']),
  /** Issuer DID */
  issuerDid: z.string().startsWith('did:cardano:'),
  /** Holder DID */
  holderDid: z.string().startsWith('did:cardano:'),
  /** Credential hash (jti for COSE-SD, SHA-256 for Ed25519) */
  vcHash: z.string().min(1),
  /** Credential type (e.g., 'ContributionCredential') */
  vcType: z.string().min(1),
  /** Credential format */
  vcFormat: z.enum(['cose-sd', 'ed25519']),
  /** Validator DID (required for 'validate' events) */
  validatorDid: z.string().startsWith('did:cardano:').optional(),
  /** Revocation reason (optional, for 'revoke' events) — allowlisted enum only (F-META-03) */
  reason: RevocationReasonEnum.optional(),
  /** IPFS CID of the credential payload (optional, for 'issue' events) */
  ipfsCid: z.string().optional(),
  /** COSE_Sign1 signature wrapper: JSON.stringify({ sig: hex, key: hex, address: hex }) */
  payloadSig: z.string(),
  /** ISO 8601 timestamp */
  ts: z.string().datetime(),
}).passthrough();

export type VCEventPayload = z.infer<typeof VCEventPayloadSchema>;

/** VC metadata label (per §8.1) */
export const L_VC = 199675;
