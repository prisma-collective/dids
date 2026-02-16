import type { DIDEvent, PrismaPayloadSig } from '@prisma-dids/types';
import { verifyCoseSign1Signature } from './cose-verify.js';
import { utf8ToBytes } from '../utils/encoding.js';

/**
 * Verifies a DID event per §3.3.2
 * Returns true if:
 * 1. COSE_Sign1 signature is cryptographically valid
 * 2. Signed payload matches the event's content fields (anti-tamper)
 * 3. Signer stake address matches the DID controller
 */
export async function verifyDIDEvent(event: DIDEvent): Promise<boolean> {
  try {
    const payloadSig: PrismaPayloadSig = JSON.parse(event.payloadSig);
    const result = await verifyCoseSign1Signature(payloadSig);

    if (!result.valid || !result.signerStakeAddress || !result.signedPayload) return false;

    // Payload binding: the signed bytes must match the event's content fields.
    // signDIDPayload() signs JSON.stringify({id, ipfs, action, v, prev}).
    const expectedPayload = JSON.stringify({
      id: event.id,
      ipfs: event.ipfs,
      action: event.action,
      v: event.v,
      prev: event.prev,
    });
    const expectedBytes = utf8ToBytes(expectedPayload);
    if (!bytesEqual(result.signedPayload, expectedBytes)) return false;

    // Compare controller: DID stake address must match signer stake address
    const stakeAddressFromDid = event.id.replace('did:cardano:', '');
    return stakeAddressFromDid === result.signerStakeAddress;
  } catch {
    return false;
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
