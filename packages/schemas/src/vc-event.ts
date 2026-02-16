import { z } from 'zod';

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
  /** Revocation reason (optional, for 'revoke' events) */
  reason: z.string().optional(),
  /** COSE_Sign1 signature wrapper: JSON.stringify({ sig: hex, key: hex, address: hex }) */
  payloadSig: z.string(),
  /** ISO 8601 timestamp */
  ts: z.string().datetime(),
});

export type VCEventPayload = z.infer<typeof VCEventPayloadSchema>;

/** VC metadata label (per §8.1) */
export const L_VC = 199675;
