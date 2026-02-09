import bs58 from 'bs58';
import { hexToBytes, concatBytes } from './encoding';

/**
 * Extracts the raw 32-byte Ed25519 public key from a CIP-30 COSE_Key.
 * CIP-30 signData returns keys in COSE_Key format (CBOR-encoded).
 *
 * COSE_Key structure for Ed25519:
 * - Key type (1): OKP (1)
 * - Curve (-1): Ed25519 (6)
 * - X coordinate (-2): 32-byte public key
 *
 * The raw key is typically at the end of the CBOR structure.
 */
export function extractRawPublicKey(coseKeyHex: string): string {
  const keyBytes = hexToBytes(coseKeyHex);

  // If it's already 32 bytes, assume it's raw
  if (keyBytes.length === 32) {
    return coseKeyHex;
  }

  // COSE_Key for Ed25519 has the 32-byte public key at the end
  // The structure is typically: a4 01 01 03 27 20 06 21 58 20 <32 bytes>
  // where 58 20 indicates a 32-byte bytestring follows
  if (keyBytes.length > 32) {
    // Find the 32-byte public key - it's the last 32 bytes after the CBOR header
    // Look for 0x58 0x20 pattern (CBOR byte string of length 32)
    for (let i = 0; i < keyBytes.length - 33; i++) {
      if (keyBytes[i] === 0x58 && keyBytes[i + 1] === 0x20) {
        // Found the marker, extract the 32 bytes after it
        const rawKey = keyBytes.slice(i + 2, i + 34);
        if (rawKey.length === 32) {
          return Array.from(rawKey)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        }
      }
    }

    // Fallback: try taking the last 32 bytes
    const rawKey = keyBytes.slice(-32);
    return Array.from(rawKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  throw new Error(`Cannot extract public key from COSE_Key: unexpected length ${keyBytes.length}`);
}

/**
 * Converts hex Ed25519 public key (CIP-30 format) to publicKeyMultibase (z6Mk...)
 * Per W3C Ed25519VerificationKey2020 specification
 *
 * Browser-compatible: uses Uint8Array instead of Buffer.
 * Automatically handles COSE_Key format from CIP-30 wallets.
 */
export function hexToPublicKeyMultibase(hexKey: string): string {
  // Extract raw key if it's in COSE_Key format
  const rawKeyHex = extractRawPublicKey(hexKey);

  // Ed25519 public keys are 32 bytes (browser-compatible)
  const keyBytes = hexToBytes(rawKeyHex);

  if (keyBytes.length !== 32) {
    throw new Error(`Invalid Ed25519 public key: expected 32 bytes, got ${keyBytes.length}`);
  }

  // Multicodec prefix for Ed25519 public key: 0xed01
  const multicodecPrefix = new Uint8Array([0xed, 0x01]);
  const multicodecKey = concatBytes(multicodecPrefix, keyBytes);

  // Base58-btc encode with 'z' prefix (multibase indicator)
  const base58Encoded = bs58.encode(multicodecKey);
  const result = 'z' + base58Encoded;

  // Validate result before returning (fail fast)
  if (!isValidPublicKeyMultibase(result)) {
    throw new Error('Generated invalid multibase key');
  }

  return result;
}

/**
 * Validates that a string is a valid Ed25519 multibase public key
 * Ed25519 keys with 0xed01 prefix (34 bytes) base58-encode to 47-48 chars
 */
export function isValidPublicKeyMultibase(key: string): boolean {
  return /^z[1-9A-HJ-NP-Za-km-z]{46,48}$/.test(key);
}
