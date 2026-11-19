import type { CIP30API, PrismaPayloadSig } from '@prisma-dids/types';
import { utf8ToBytes, bytesToHex } from '../utils/encoding.js';

/**
 * Pinning to IPFS goes through the apps' /api/ipfs/pin, which spends
 * Prisma's Pinata account. Each pin carries a wallet signature over a
 * pin intent, and the server pins only a DID document or a credential
 * envelope that belongs to the signing wallet's own DID.
 *
 * Browser-safe: no cardano-serialization-lib here. The server check is
 * in pin-auth.ts.
 */

export const PIN_PURPOSE = 'prisma-dids/ipfs-pin';
/** The largest JSON object the pin routes accept. */
export const MAX_PIN_BYTES = 64 * 1024;

const DID_DOC_KEYS = new Set(['@context', 'id', 'verificationMethod', 'authentication', 'service', 'status', 'revokedAt']);
const VC_ENVELOPE_KEYS = ['credentialString', 'jti', 'vct', 'issuerDid', 'holderDid', 'issuedAt'];

export interface SignedPin {
  data: Record<string, unknown>;
  ts: string;
  payloadSig: PrismaPayloadSig;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

/** The exact text the wallet signs for one pin. */
export async function pinIntentMessage(data: object, ts: string): Promise<string> {
  return JSON.stringify({ purpose: PIN_PURPOSE, sha256: await sha256Hex(JSON.stringify(data)), ts });
}

/**
 * The DID a pin belongs to, or null if `data` is neither a DID
 * document (create, update, revoke) nor a credential envelope.
 */
export function pinOwnerDid(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);
  const isDid = (v: unknown): v is string => typeof v === 'string' && v.startsWith('did:cardano:');

  // DID document: a W3C DID context and an id; nothing outside the known fields.
  const context = obj['@context'];
  if (
    Array.isArray(context) &&
    context.includes('https://www.w3.org/ns/did/v1') &&
    isDid(obj.id) &&
    keys.every((k) => DID_DOC_KEYS.has(k))
  ) {
    return obj.id;
  }

  // Credential envelope from the VC interface: exactly these string fields.
  if (
    keys.length === VC_ENVELOPE_KEYS.length &&
    VC_ENVELOPE_KEYS.every((k) => typeof obj[k] === 'string') &&
    isDid(obj.issuerDid)
  ) {
    return obj.issuerDid;
  }
  return null;
}

/** Sign a pin intent with the wallet (one signData prompt). */
export async function signPinIntent(
  wallet: CIP30API,
  data: Record<string, unknown>,
  signingAddress: string
): Promise<SignedPin> {
  const ts = new Date().toISOString();
  const message = await pinIntentMessage(data, ts);
  const { signature, key } = await wallet.signData(signingAddress, bytesToHex(utf8ToBytes(message)));
  return { data, ts, payloadSig: { sig: signature, key, address: signingAddress } };
}
