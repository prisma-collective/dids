import { ed25519 } from '../utils/crypto-setup';
import { deriveStakeAddressFromBaseAddress } from '../utils/stake';
import { utf8ToBytes, hexToBytes } from '../utils/encoding';
import type { DIDEvent, DidEventPayload, PrismaPayloadSig } from '@prisma-dids/types';

/**
 * Verifies a DID event per §3.3.2
 * Returns true if signature is valid and controller matches DID
 *
 * IMPORTANT: Verification uses UTF-8 bytes, not hex.
 * Even though wallets sign hex-encoded data, the signature is over UTF-8 bytes.
 *
 * Browser-compatible: uses TextEncoder and WebCrypto (works in Node + browser).
 */
export async function verifyDIDEvent(event: DIDEvent): Promise<boolean> {
  try {
    // 1. Parse payloadSig
    const payloadSig: PrismaPayloadSig = JSON.parse(event.payloadSig);

    // 2. Reconstruct payload (must match what was signed)
    const payload: DidEventPayload = {
      id: event.id,
      ipfs: event.ipfs,
      action: event.action,
      v: event.v,
      prev: event.prev
    };
    const payloadStr = JSON.stringify(payload);

    // 3. Verify Ed25519 signature (browser-compatible)
    //    Note: Verify against UTF-8 bytes (what was actually signed)
    //    Even though signData received hex, it signs the underlying bytes
    //    Using verifyAsync which uses WebCrypto (no SHA-512 config needed)
    const message = utf8ToBytes(payloadStr);
    const sigBytes = hexToBytes(payloadSig.sig);
    const keyBytes = hexToBytes(payloadSig.key);
    const validSig = await ed25519.verifyAsync(sigBytes, message, keyBytes);

    if (!validSig) return false;

    // 4. Extract stake address from DID
    const stakeAddressFromDid = event.id.replace('did:cardano:', '');

    // 5. Derive stake address from signing address
    const stakeAddressFromSigningAddress = deriveStakeAddressFromBaseAddress(payloadSig.address);

    // 6. Compare controller
    return stakeAddressFromDid === stakeAddressFromSigningAddress;

  } catch (error) {
    console.error('Verification failed:', error);
    return false;
  }
}
