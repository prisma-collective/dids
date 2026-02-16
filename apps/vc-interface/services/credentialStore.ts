/**
 * Local credential store — persists COSE-SD credential strings in localStorage.
 *
 * Credentials are keyed by jti (credential ID). This allows the holder to:
 * 1. Store credentials received after issuance
 * 2. Retrieve them for selective disclosure presentations
 * 3. List all stored credentials for the inbox
 *
 * In production, credentials would live in a secure wallet or vault.
 */

import type { VerifiableCredential, VCClaim } from '@/types/vc';

const STORE_KEY = 'prisma-vc-credentials';

export interface StoredCredential {
  /** Full COSE-SD wire format string */
  credentialString: string;
  /** Credential ID (jti) */
  jti: string;
  /** Credential type */
  vct: string;
  /** Issuer DID */
  issuerDid: string;
  /** Holder DID */
  holderDid: string;
  /** Issuance timestamp (ISO) */
  issuedAt: string;
  /** On-chain anchor tx hash (if anchored) */
  txHash?: string;
}

function loadStore(): Record<string, StoredCredential> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, StoredCredential>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {}
}

/** Save a credential after issuance or import */
export function storeCredential(cred: StoredCredential): void {
  const store = loadStore();
  store[cred.jti] = cred;
  saveStore(store);
}

/** Get a single credential by jti */
export function getCredential(jti: string): StoredCredential | null {
  const store = loadStore();
  return store[jti] || null;
}

/** Get all stored credentials for a given holder DID */
export function getCredentialsForHolder(holderDid: string): StoredCredential[] {
  const store = loadStore();
  return Object.values(store).filter(c => c.holderDid === holderDid);
}

/** Get all stored credentials issued by a given issuer DID */
export function getCredentialsForIssuer(issuerDid: string): StoredCredential[] {
  const store = loadStore();
  return Object.values(store).filter(c => c.issuerDid === issuerDid);
}

/** Remove a credential from the store */
export function removeCredential(jti: string): void {
  const store = loadStore();
  delete store[jti];
  saveStore(store);
}

/**
 * Convert a stored credential + claims into the UI's VerifiableCredential type,
 * enriched with status from the indexer.
 */
export function toVerifiableCredential(
  stored: StoredCredential,
  claims: VCClaim[],
  status: 'active' | 'revoked' | 'pending' | 'not_found' = 'pending'
): VerifiableCredential {
  return {
    id: stored.jti,
    type: stored.vct as VerifiableCredential['type'],
    issuerDid: stored.issuerDid,
    holderDid: stored.holderDid,
    issuedAt: stored.issuedAt,
    status,
    claims,
    txHash: stored.txHash,
    credentialString: stored.credentialString,
  };
}
