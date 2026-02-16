/**
 * SD-JWT disclosure utilities for COSE-SD Verifiable Credentials.
 *
 * Implements the SD-JWT selective disclosure mechanism (salted hashes, _sd array,
 * base64url-encoded disclosure triples) using COSE_Sign1 signing instead of JWS.
 *
 * Wire format: base64url(JSON.stringify({header, payload, payloadSig}))~disc1~disc2~
 *
 * Reference: IETF SD-JWT draft + Prisma COSE-SD adaptation (§7.3)
 */

// ─── base64url helpers (browser-compatible, no Buffer) ───

export function base64urlEncode(data: Uint8Array): string {
  // Convert bytes to base64 via binary string
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(str: string): Uint8Array {
  // Restore standard base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding
  while (base64.length % 4 !== 0) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64urlEncodeString(str: string): string {
  return base64urlEncode(new TextEncoder().encode(str));
}

export function base64urlDecodeString(str: string): string {
  return new TextDecoder().decode(base64urlDecode(str));
}

// ─── Disclosure creation ───

export interface Disclosure {
  /** base64url-encoded JSON triple [salt, key, value] */
  encoded: string;
  /** SHA-256 hash of the encoded disclosure (hex string for _sd array) */
  hash: string;
  /** Claim key */
  key: string;
  /** Claim value */
  value: unknown;
}

/**
 * Generate a cryptographically random salt (128-bit, base64url-encoded).
 * Browser-compatible via crypto.getRandomValues().
 */
function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

/**
 * SHA-256 hash of a string, returned as base64url.
 * Uses WebCrypto for browser compatibility.
 */
async function sha256Base64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(new Uint8Array(hashBuffer));
}

/**
 * Create a disclosure for a single claim.
 * Disclosure = base64url(JSON.stringify([salt, key, value]))
 * Hash = base64url(SHA-256(disclosure))
 */
export async function createDisclosure(
  key: string,
  value: unknown
): Promise<Disclosure> {
  const salt = generateSalt();
  const triple = JSON.stringify([salt, key, value]);
  const encoded = base64urlEncodeString(triple);
  const hash = await sha256Base64url(encoded);

  return { encoded, hash, key, value };
}

/**
 * Create disclosures for multiple claims and build the _sd array.
 * Returns the disclosures and the _sd hash array for the credential payload.
 */
export async function createDisclosures(
  claims: Record<string, unknown>,
  disclosableKeys: string[]
): Promise<{ disclosures: Disclosure[]; sdArray: string[] }> {
  const disclosures: Disclosure[] = [];
  const sdArray: string[] = [];

  for (const key of disclosableKeys) {
    if (key in claims) {
      const disclosure = await createDisclosure(key, claims[key]);
      disclosures.push(disclosure);
      sdArray.push(disclosure.hash);
    }
  }

  return { disclosures, sdArray };
}

// ─── Credential wire format ───

export interface CoseSDEnvelope {
  header: { alg: 'EdDSA-COSE'; vct: string };
  payload: Record<string, unknown>;
  payloadSig: { sig: string; key: string; address: string };
}

/**
 * Pack a COSE-SD credential into wire format.
 * Format: base64url(JSON.stringify(envelope))~disc1~disc2~
 */
export function packCredential(
  envelope: CoseSDEnvelope,
  disclosures: Disclosure[]
): string {
  const envelopePart = base64urlEncodeString(JSON.stringify(envelope));
  const disclosureParts = disclosures.map(d => d.encoded);
  // Wire format: envelope~disc1~disc2~...~ (trailing ~ per SD-JWT spec)
  return [envelopePart, ...disclosureParts, ''].join('~');
}

/**
 * Unpack a COSE-SD credential from wire format.
 * Returns the envelope and all disclosure strings.
 */
export function unpackCredential(
  credentialString: string
): { envelope: CoseSDEnvelope; disclosureStrings: string[] } {
  const parts = credentialString.split('~');
  // Last part is empty (trailing ~), envelope is first
  const envelopePart = parts[0]!;
  // Disclosures are everything between first and last (empty) parts
  const disclosureStrings = parts.slice(1).filter(s => s.length > 0);

  const envelope: CoseSDEnvelope = JSON.parse(base64urlDecodeString(envelopePart));
  return { envelope, disclosureStrings };
}

/**
 * Decode a disclosure string into its [salt, key, value] triple.
 */
export function decodeDisclosure(
  encoded: string
): { salt: string; key: string; value: unknown } {
  const json = base64urlDecodeString(encoded);
  const [salt, key, value] = JSON.parse(json) as [string, string, unknown];
  return { salt, key, value };
}

/**
 * Verify that a disclosure matches a hash in the _sd array.
 */
export async function verifyDisclosureHash(
  encoded: string,
  expectedHash: string
): Promise<boolean> {
  const hash = await sha256Base64url(encoded);
  return hash === expectedHash;
}
