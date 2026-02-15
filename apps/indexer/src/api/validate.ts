/**
 * Validates a did:cardano DID string.
 *
 * Format: did:cardano:stake_test1<bech32> (preprod) or did:cardano:stake1<bech32> (mainnet)
 * Bech32 payload is 28 bytes = ~45 bech32 chars, so total DID is ~60-70 chars.
 */
const DID_PATTERN = /^did:cardano:stake(?:_test)?1[a-z0-9]{38,}$/;

export function isValidDid(did: string): boolean {
  return DID_PATTERN.test(did);
}
