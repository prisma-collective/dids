import { ed25519 } from '../utils/crypto-setup.js';
import { deriveStakeAddressFromBaseAddress } from '../utils/stake.js';
import { Address } from '../utils/cardano-serialization.js';
import { hexToBytes } from '../utils/encoding.js';
import { decode as cborDecode, encode as cborEncode } from 'cborg';
import type { DIDEvent, PrismaPayloadSig } from '@prisma-dids/types';

/**
 * Verifies a DID event per §3.3.2
 * Returns true if signature is valid and controller matches DID
 *
 * Handles CIP-8 COSE_Sign1 signatures from CIP-30 wallet.signData().
 * The sig field is hex(COSE_Sign1) and key field is hex(COSE_Key).
 */
export async function verifyDIDEvent(event: DIDEvent): Promise<boolean> {
  try {
    // 1. Parse payloadSig
    const payloadSig: PrismaPayloadSig = JSON.parse(event.payloadSig);

    // 2. Decode CIP-8 COSE structures
    const sigBytes = hexToBytes(payloadSig.sig);
    const keyBytes = hexToBytes(payloadSig.key);

    // Decode COSE_Sign1 = [protectedHeaders, unprotectedHeaders, payload, signature]
    // useMaps: true required for COSE integer map keys
    const cborOpts = { useMaps: true };
    const coseSign1 = cborDecode(sigBytes, cborOpts) as [Uint8Array, Map<number, unknown>, Uint8Array, Uint8Array];
    const protectedHeaders = coseSign1[0]; // CBOR-encoded protected headers
    const cosePayload = coseSign1[2];      // signed payload bytes
    const rawSignature = coseSign1[3];     // 64-byte Ed25519 signature

    // Decode COSE_Key to extract raw public key
    // COSE_Key map: {1: kty, 3: alg, -1: crv, -2: x (public key bytes)}
    const coseKey = cborDecode(keyBytes, cborOpts) as Map<number, unknown>;
    const rawPublicKey = coseKey.get(-2) as Uint8Array;

    if (!rawSignature || rawSignature.length !== 64) {
      console.error(`Unexpected signature length: ${rawSignature?.length}`);
      return false;
    }
    if (!rawPublicKey || rawPublicKey.length !== 32) {
      console.error(`Unexpected public key length: ${rawPublicKey?.length}`);
      return false;
    }

    // 3. Build COSE Sig_structure for verification
    //    Sig_structure = ["Signature1", protectedHeaders, externalAad, payload]
    const sigStructure = [
      'Signature1',
      protectedHeaders,
      new Uint8Array(0), // external_aad (empty)
      cosePayload,
    ];
    const sigStructureBytes = cborEncode(sigStructure);

    // 4. Verify Ed25519 signature over the Sig_structure
    const validSig = await ed25519.verifyAsync(rawSignature, sigStructureBytes, rawPublicKey);

    if (!validSig) return false;

    // 5. Extract stake address from DID
    const stakeAddressFromDid = event.id.replace('did:cardano:', '');

    // 6. Derive stake address from signing address
    //    CIP-30 signData returns address as hex — convert to bech32 first
    const addrBech32 = Address.from_bytes(hexToBytes(payloadSig.address)).to_bech32();
    const stakeAddressFromSigningAddress = deriveStakeAddressFromBaseAddress(addrBech32);

    // 7. Compare controller
    return stakeAddressFromDid === stakeAddressFromSigningAddress;

  } catch (error) {
    console.error('Verification failed:', error);
    return false;
  }
}
