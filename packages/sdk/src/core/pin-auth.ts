import { verifyCoseSign1Signature } from './cose-verify.js';
import { MAX_PIN_BYTES, pinIntentMessage, pinOwnerDid } from './pin-intent.js';
import { utf8ToBytes } from '../utils/encoding.js';

/** How old a pin intent may be, and how far in the future (clock skew). */
const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_SKEW_MS = 60 * 1000;

export type PinCheck =
  | { ok: true; data: Record<string, unknown>; did: string }
  | { ok: false; status: 400 | 401 | 413; error: string };

/**
 * Server-side check for POST /api/ipfs/pin. Node.js only (COSE needs CSL).
 *
 * Passes only when:
 * 1. `data` is a DID document or a credential envelope (pinOwnerDid);
 * 2. the wallet signed this pin intent: the sha256 of `data`, with `ts`;
 * 3. `ts` is recent;
 * 4. the signing wallet is the DID the data belongs to.
 */
export async function verifyPinRequest(body: unknown, now: number = Date.now()): Promise<PinCheck> {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'Invalid request body' };
  const { data, ts, payloadSig } = body as Record<string, unknown>;

  const did = pinOwnerDid(data);
  if (!did) return { ok: false, status: 400, error: 'Only a DID document or a credential envelope can be pinned' };
  if (JSON.stringify(data).length > MAX_PIN_BYTES) return { ok: false, status: 413, error: 'Request body too large' };

  const sig = payloadSig as Record<string, unknown> | undefined;
  if (typeof ts !== 'string' || !sig || typeof sig.sig !== 'string' || typeof sig.key !== 'string' || typeof sig.address !== 'string') {
    return { ok: false, status: 401, error: 'A wallet signature is required to pin' };
  }
  const at = Date.parse(ts);
  if (Number.isNaN(at) || now - at > MAX_AGE_MS || at - now > MAX_SKEW_MS) {
    return { ok: false, status: 401, error: 'The pin signature has expired; sign again' };
  }

  const result = await verifyCoseSign1Signature({ sig: sig.sig, key: sig.key, address: sig.address });
  if (!result.valid || !result.signedPayload || !result.signerStakeAddress) {
    return { ok: false, status: 401, error: 'Invalid wallet signature' };
  }
  const expected = utf8ToBytes(await pinIntentMessage(data as object, ts));
  if (!sameBytes(result.signedPayload, expected)) {
    return { ok: false, status: 401, error: 'The signature is not for this content' };
  }
  if (did !== `did:cardano:${result.signerStakeAddress}`) {
    return { ok: false, status: 401, error: 'Only the DID\'s own wallet can pin its documents' };
  }
  return { ok: true, data: data as Record<string, unknown>, did };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
