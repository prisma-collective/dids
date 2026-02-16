/**
 * VC Anchoring — on-chain event submission for Verifiable Credentials.
 *
 * Builds and submits VC metadata events (issue, validate, revoke) under
 * label L_VC (199675) on Cardano. Same tx pattern as DID events (builder.ts).
 *
 * Uses COSE_Sign1 via CIP-30 wallet.signData() for signing — private keys
 * never leave the wallet.
 *
 * Reference: P2 Implementation Plan §Phase 3, TECHNICAL_DESIGN §8
 */
import { Lucid, Blockfrost } from 'lucid-cardano';
import type { CIP30API, NetworkConfig, PrismaPayloadSig } from '@prisma-dids/types';
import { L_VC } from '@prisma-dids/types';
import { utf8ToBytes, bytesToHex } from '../utils/encoding.js';
import { serializeEventMetadata } from '../tx/metadata.js';
import { base64urlEncode } from './sd-jwt.js';

// ─── Types ───

export interface AnchorIssuanceParams {
  issuerDid: string;
  holderDid: string;
  /** For COSE-SD: the credential's jti. For Ed25519: SHA-256 hash. */
  vcHash: string;
  vcType: string;
  vcFormat: 'cose-sd' | 'ed25519';
}

export interface AnchorValidationParams {
  issuerDid: string;
  holderDid: string;
  vcHash: string;
  vcType: string;
  vcFormat: 'cose-sd' | 'ed25519';
  /** Third-party validator's DID */
  validatorDid: string;
}

export interface AnchorRevocationParams {
  issuerDid: string;
  holderDid: string;
  vcHash: string;
  vcType: string;
  vcFormat: 'cose-sd' | 'ed25519';
  /** Optional revocation reason */
  reason?: string;
}

export interface AnchorResult {
  /** On-chain transaction hash */
  txHash: string;
}

export interface VCStatusResult {
  /** Current credential status */
  status: 'active' | 'revoked' | 'unknown';
  /** ISO timestamp of revocation (if revoked) */
  revokedAt?: string;
  /** Revocation reason (if provided) */
  reason?: string;
  /** Whether the status is confirmed on-chain */
  confirmed?: boolean;
}

// ─── Provider Interface (2B.4) ───

/**
 * Abstract interface for VC anchoring — enables future backend swaps.
 * Default implementation: CardanoVCAnchorProvider (Lucid + Blockfrost).
 */
export interface VCAnchorProvider {
  anchorIssuance(
    wallet: CIP30API,
    signingAddress: string,
    params: AnchorIssuanceParams
  ): Promise<AnchorResult>;

  anchorValidation(
    wallet: CIP30API,
    signingAddress: string,
    params: AnchorValidationParams
  ): Promise<AnchorResult>;

  anchorRevocation(
    wallet: CIP30API,
    signingAddress: string,
    params: AnchorRevocationParams
  ): Promise<AnchorResult>;
}

// ─── VC Event Payload Building ───

/** Unsigned VC event fields (signed via wallet.signData, ts included in signed payload) */
interface UnsignedVCEventFields {
  event: 'issue' | 'validate' | 'revoke';
  issuerDid: string;
  holderDid: string;
  vcHash: string;
  vcType: string;
  vcFormat: 'cose-sd' | 'ed25519';
  validatorDid?: string;
  reason?: string;
  ts: string;
}

/**
 * Sign a VC event payload via CIP-30 wallet.signData().
 * Follows the same pattern as signDIDPayload() in signature.ts.
 *
 * The signed payload is JSON.stringify(fields) where fields includes
 * event, issuerDid, holderDid, vcHash, vcType, vcFormat, and optionally
 * validatorDid, reason, and ts — matching vc-processor's payload binding check.
 */
async function signVCEventPayload(
  wallet: CIP30API,
  signingAddress: string,
  fields: UnsignedVCEventFields
): Promise<PrismaPayloadSig> {
  const payloadStr = JSON.stringify(fields);
  const payloadBytes = utf8ToBytes(payloadStr);
  const payloadHex = bytesToHex(payloadBytes);

  const { signature, key } = await wallet.signData(signingAddress, payloadHex);

  return { sig: signature, key, address: signingAddress };
}

/**
 * Build a full on-chain VC event (ready for metadata serialization).
 * The event includes the payloadSig as a JSON string, matching VCEventPayloadSchema.
 */
function buildVCEvent(
  fields: UnsignedVCEventFields,
  payloadSig: PrismaPayloadSig
): Record<string, unknown> {
  const event: Record<string, unknown> = {
    event: fields.event,
    issuerDid: fields.issuerDid,
    holderDid: fields.holderDid,
    vcHash: fields.vcHash,
    vcType: fields.vcType,
    vcFormat: fields.vcFormat,
    payloadSig: JSON.stringify(payloadSig),
    ts: fields.ts,
  };

  if (fields.validatorDid !== undefined) {
    event.validatorDid = fields.validatorDid;
  }
  if (fields.reason !== undefined) {
    event.reason = fields.reason;
  }

  return event;
}

/**
 * Submit a VC event on-chain via Lucid + Blockfrost.
 * Internal helper used by all anchor functions.
 */
async function submitVCEvent(
  wallet: CIP30API,
  event: Record<string, unknown>,
  config: NetworkConfig
): Promise<string> {
  if (!config.blockfrostApiKey) {
    throw new Error('Blockfrost API key required for transaction submission');
  }

  const lucid = await Lucid.new(
    new Blockfrost(
      `https://cardano-${config.network.toLowerCase()}.blockfrost.io/api/v0`,
      config.blockfrostApiKey
    ),
    config.network
  );

  lucid.selectWallet(wallet as any);

  const metadata = serializeEventMetadata(L_VC, event);
  const tx = await lucid
    .newTx()
    .attachMetadata(L_VC, metadata[L_VC])
    .complete();

  const signedTx = await tx.sign().complete();
  const txHash = await signedTx.submit();

  return txHash;
}

// ─── Anchor Functions ───

/**
 * Anchor a VC issuance event on-chain (2B.2).
 *
 * Process:
 * 1. Build unsigned event fields with event:'issue'
 * 2. Sign via wallet.signData() → payloadSig
 * 3. Build full VCEventPayload with payloadSig
 * 4. Serialize to L_VC metadata with 64-byte chunking
 * 5. Submit tx via Lucid
 */
export async function anchorVCIssuance(
  wallet: CIP30API,
  signingAddress: string,
  params: AnchorIssuanceParams,
  config: NetworkConfig
): Promise<AnchorResult> {
  const ts = new Date().toISOString();
  const fields: UnsignedVCEventFields = {
    event: 'issue',
    issuerDid: params.issuerDid,
    holderDid: params.holderDid,
    vcHash: params.vcHash,
    vcType: params.vcType,
    vcFormat: params.vcFormat,
    ts,
  };

  const payloadSig = await signVCEventPayload(wallet, signingAddress, fields);
  const event = buildVCEvent(fields, payloadSig);
  const txHash = await submitVCEvent(wallet, event, config);

  return { txHash };
}

/**
 * Anchor a VC validation event on-chain (2B.3).
 * Third-party validators sign attestations for existing credentials.
 */
export async function anchorVCValidation(
  wallet: CIP30API,
  signingAddress: string,
  params: AnchorValidationParams,
  config: NetworkConfig
): Promise<AnchorResult> {
  const ts = new Date().toISOString();
  const fields: UnsignedVCEventFields = {
    event: 'validate',
    issuerDid: params.issuerDid,
    holderDid: params.holderDid,
    vcHash: params.vcHash,
    vcType: params.vcType,
    vcFormat: params.vcFormat,
    validatorDid: params.validatorDid,
    ts,
  };

  const payloadSig = await signVCEventPayload(wallet, signingAddress, fields);
  const event = buildVCEvent(fields, payloadSig);
  const txHash = await submitVCEvent(wallet, event, config);

  return { txHash };
}

/**
 * Anchor a VC revocation event on-chain (2A.5).
 * Signer should be the issuer — the indexer's status reducer verifies
 * revocation authorization at query time (Audit Fix #20).
 */
export async function anchorVCRevocation(
  wallet: CIP30API,
  signingAddress: string,
  params: AnchorRevocationParams,
  config: NetworkConfig
): Promise<AnchorResult> {
  const ts = new Date().toISOString();
  const fields: UnsignedVCEventFields = {
    event: 'revoke',
    issuerDid: params.issuerDid,
    holderDid: params.holderDid,
    vcHash: params.vcHash,
    vcType: params.vcType,
    vcFormat: params.vcFormat,
    ...(params.reason !== undefined && { reason: params.reason }),
    ts,
  };

  const payloadSig = await signVCEventPayload(wallet, signingAddress, fields);
  const event = buildVCEvent(fields, payloadSig);
  const txHash = await submitVCEvent(wallet, event, config);

  return { txHash };
}

// ─── Status Check (2A.6) ───

/**
 * Check VC revocation status by querying the indexer (2A.6).
 * Browser-compatible — uses fetch only.
 *
 * @param vcHash - Credential hash (jti for COSE-SD, SHA-256 for Ed25519)
 * @param indexerEndpoint - VC Indexer base URL (e.g., https://vc-indexer.example.com)
 */
export async function checkRevocationStatus(
  vcHash: string,
  indexerEndpoint: string
): Promise<VCStatusResult> {
  const url = `${indexerEndpoint}/vc/${encodeURIComponent(vcHash)}/status`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return { status: 'unknown' };
    }
    throw new Error(`Indexer request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    status: (data.status as 'active' | 'revoked' | 'unknown') ?? 'unknown',
    revokedAt: data.revokedAt as string | undefined,
    reason: data.reason as string | undefined,
    confirmed: data.confirmed as boolean | undefined,
  };
}

// ─── VC Hash Computation (2B.1) ───

/**
 * Recursively sort object keys for deterministic JSON serialization.
 * Handles nested objects and arrays (objects inside arrays are also sorted).
 */
function stableSort(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableSort);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = stableSort((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Compute VC hash for Ed25519-format credentials.
 * For COSE-SD credentials, the vcHash is simply the jti (urn:uuid:...).
 *
 * Ed25519 credentials don't have a jti, so the hash is computed as
 * SHA-256 of the canonicalized credential JSON (recursively sorted keys).
 *
 * @param credential - The credential object to hash
 * @returns base64url-encoded SHA-256 hash
 */
export async function computeEd25519VcHash(
  credential: Record<string, unknown>
): Promise<string> {
  const canonical = JSON.stringify(stableSort(credential));
  const data = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(new Uint8Array(hashBuffer));
}

// ─── Default Provider (2B.4) ───

/**
 * Default VC anchor provider using Cardano (Lucid + Blockfrost).
 * Instantiate with a NetworkConfig and use for all anchoring operations.
 */
export class CardanoVCAnchorProvider implements VCAnchorProvider {
  constructor(private config: NetworkConfig) {}

  async anchorIssuance(
    wallet: CIP30API,
    signingAddress: string,
    params: AnchorIssuanceParams
  ): Promise<AnchorResult> {
    return anchorVCIssuance(wallet, signingAddress, params, this.config);
  }

  async anchorValidation(
    wallet: CIP30API,
    signingAddress: string,
    params: AnchorValidationParams
  ): Promise<AnchorResult> {
    return anchorVCValidation(wallet, signingAddress, params, this.config);
  }

  async anchorRevocation(
    wallet: CIP30API,
    signingAddress: string,
    params: AnchorRevocationParams
  ): Promise<AnchorResult> {
    return anchorVCRevocation(wallet, signingAddress, params, this.config);
  }
}
