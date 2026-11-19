import { ed25519 } from '../utils/crypto-setup.js';
import { deriveStakeAddressFromBaseAddress } from '../utils/stake.js';
import { Address, BaseAddress, PublicKey } from '../utils/cardano-serialization.js';
import { hexToBytes } from '../utils/encoding.js';
import { decode as cborDecode, encode as cborEncode } from 'cborg';

export interface CoseVerifyResult {
  valid: boolean;
  /** Stake address (bech32) derived from payloadSig.address */
  signerStakeAddress?: string;
  /** Raw bytes of the COSE_Sign1 payload — the data that was actually signed.
   *  Callers MUST compare this against the expected event content to prevent
   *  payload-tampering attacks (reusing a valid sig with different event fields). */
  signedPayload?: Uint8Array;
  error?: string;
}

/**
 * Generic COSE_Sign1 signature verification + stake address derivation.
 * Reused by both DID event verification and VC event verification.
 *
 * Steps:
 * 1. Decode COSE_Sign1 from payloadSig.sig (hex → CBOR)
 * 2. Extract Ed25519 public key from COSE_Key (payloadSig.key)
 * 3. Build Sig_structure, verify Ed25519
 * 4. Check the key is the address's payment key: blake2b-224(key) must
 *    equal the address's payment key hash. Without this, anyone could sign
 *    with their own key and claim any address, and so any DID.
 * 5. Convert payloadSig.address hex → bech32 → derive stake address
 */
export async function verifyCoseSign1Signature(
  payloadSig: { sig: string; key: string; address: string }
): Promise<CoseVerifyResult> {
  try {
    // 1. Decode CIP-8 COSE structures
    const sigBytes = hexToBytes(payloadSig.sig);
    const keyBytes = hexToBytes(payloadSig.key);

    // Decode COSE_Sign1 = [protectedHeaders, unprotectedHeaders, payload, signature]
    const cborOpts = { useMaps: true };
    const coseSign1 = cborDecode(sigBytes, cborOpts) as [Uint8Array, Map<number, unknown>, Uint8Array, Uint8Array];
    const protectedHeaders = coseSign1[0];
    const cosePayload = coseSign1[2];
    const rawSignature = coseSign1[3];

    // Decode COSE_Key to extract raw public key
    // COSE_Key map: {1: kty, 3: alg, -1: crv, -2: x (public key bytes)}
    const coseKey = cborDecode(keyBytes, cborOpts) as Map<number, unknown>;
    const rawPublicKey = coseKey.get(-2) as Uint8Array;

    if (!rawSignature || rawSignature.length !== 64) {
      return { valid: false, error: `unexpected_signature_length_${rawSignature?.length}` };
    }
    if (!rawPublicKey || rawPublicKey.length !== 32) {
      return { valid: false, error: `unexpected_pubkey_length_${rawPublicKey?.length}` };
    }

    // 2. Build COSE Sig_structure for verification
    //    Sig_structure = ["Signature1", protectedHeaders, externalAad, payload]
    const sigStructure = [
      'Signature1',
      protectedHeaders,
      new Uint8Array(0), // external_aad (empty)
      cosePayload,
    ];
    const sigStructureBytes = cborEncode(sigStructure);

    // 3. Verify Ed25519 signature over the Sig_structure
    const validSig = await ed25519.verifyAsync(rawSignature, sigStructureBytes, rawPublicKey);

    if (!validSig) {
      return { valid: false, error: 'invalid_signature' };
    }

    // 4. The signing key must own the address (CIP-30 signs a base
    //    address's data with its payment key).
    const address = Address.from_bytes(hexToBytes(payloadSig.address));
    const paymentKeyHash = BaseAddress.from_address(address)?.payment_cred().to_keyhash()?.to_bytes();
    const keyHash = PublicKey.from_bytes(rawPublicKey).hash().to_bytes();
    if (!paymentKeyHash || !bytesEqual(paymentKeyHash, keyHash)) {
      return { valid: false, error: 'key_does_not_match_address' };
    }

    // 5. Derive stake address from signing address
    //    CIP-30 signData returns address as hex — convert to bech32 first
    const addrBech32 = address.to_bech32();
    const signerStakeAddress = deriveStakeAddressFromBaseAddress(addrBech32);

    return { valid: true, signerStakeAddress, signedPayload: cosePayload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, error: `cose_verify_failed: ${message}` };
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
