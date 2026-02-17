/**
 * VC Service Layer — wraps SDK calls, indexer queries, and on-chain anchoring.
 *
 * Browser-safe: imports VC functions from @prisma-dids/sdk/browser,
 * dynamically imports lucid-cardano for tx submission (WASM).
 *
 * Architecture:
 * - Issue/present/disclose → SDK browser functions (wallet.signData)
 * - Anchor (issue/revoke) → dynamic Lucid import (wallet.signTx)
 * - Status/credentials → indexer REST API (fetch)
 * - Verify → delegates to /api/verify (server-side, needs Node.js COSE verify)
 *
 * Signing optimization (issue flow):
 *   issueSDJwtVC() already signs the credential payload via wallet.signData().
 *   The returned payloadSig is reused for the anchor event — no second signData.
 *   This reduces wallet popups from 3→2 (signData + signTx).
 *   The indexer skips payload-binding for issue events since the signed content
 *   is the credential payload, not the anchor fields. COSE validity + signer
 *   matching is sufficient for issuance.
 */
import {
  issueSDJwtVC,
  createPresentation,
  getDisclosableClaims,
  serializeEventMetadata,
  PinataClient,
} from '@prisma-dids/sdk/browser';
import { L_VC } from '@prisma-dids/types';
import type { CIP30API, PrismaPayloadSig } from '@prisma-dids/types';
import type { IssuanceFormData, VCStatus } from '@/types/vc';

// ─── Internal Helpers ───

/** Convert string to hex (browser-safe) */
function utf8ToHex(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sign a VC event payload via CIP-30 wallet.signData().
 * Used for revoke events (issue events reuse the credential's payloadSig).
 */
async function signVCPayload(
  wallet: CIP30API,
  signingAddress: string,
  fields: Record<string, unknown>
): Promise<PrismaPayloadSig> {
  const payloadHex = utf8ToHex(JSON.stringify(fields));
  const { signature, key } = await wallet.signData(signingAddress, payloadHex);
  return { sig: signature, key, address: signingAddress };
}

/**
 * Submit a VC event on-chain via Lucid (dynamic import for browser WASM).
 */
async function submitVCEvent(
  wallet: CIP30API,
  event: Record<string, unknown>,
  networkConfig: { network: string; blockfrostApiKey: string }
): Promise<string> {
  const { Lucid, Blockfrost } = await import('lucid-cardano');
  const lucidNetwork = networkConfig.network === 'preprod' ? 'Preprod' : 'Mainnet';
  const lucid = await Lucid.new(
    new Blockfrost(
      `https://cardano-${networkConfig.network.toLowerCase()}.blockfrost.io/api/v0`,
      networkConfig.blockfrostApiKey
    ),
    lucidNetwork
  );
  lucid.selectWallet(wallet as any);

  const metadata = serializeEventMetadata(L_VC, event);
  const tx = await lucid.newTx().attachMetadata(L_VC, metadata[L_VC]).complete();
  const signedTx = await tx.sign().complete();
  return signedTx.submit();
}

// ─── Public API ───

/** Steps reported via the onProgress callback during issuance. */
export type IssueStep =
  | 'signing-credential'
  | 'pinning-ipfs'
  | 'anchoring-tx';

export interface IssueResult {
  credential: string;
  jti: string;
  txHash: string;
  ipfsCid: string;
}

/**
 * Issue a COSE-SD Verifiable Credential, pin to IPFS, and anchor on-chain.
 *
 * 1. issueSDJwtVC() → credential string + jti + payloadSig (wallet.signData)
 * 2. Pin credential to IPFS → ipfsCid (natural delay replaces 800ms sleep)
 * 3. Build anchor event with ipfsCid + reused payloadSig (no second signData)
 * 4. Submit anchor tx via Lucid (wallet.signTx)
 *
 * Only 2 wallet popups: signData (credential) + signTx (transaction).
 */
export async function issueAndAnchorCredential(
  wallet: CIP30API,
  signingAddress: string,
  issuerDid: string,
  holderDid: string,
  formData: IssuanceFormData,
  networkConfig: { network: string; blockfrostApiKey: string },
  onProgress?: (step: IssueStep) => void
): Promise<IssueResult> {
  // 1. Issue COSE-SD VC (calls wallet.signData internally)
  onProgress?.('signing-credential');
  const issued = await issueSDJwtVC(
    wallet,
    signingAddress,
    issuerDid,
    holderDid,
    formData.credentialType,
    formData.claims,
    { disclosable: formData.disclosableClaims }
  );
  const { credential, jti, payloadSig } = issued;

  // 2. Pin credential to IPFS
  onProgress?.('pinning-ipfs');
  const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT;
  if (!pinataJwt) {
    throw new Error('NEXT_PUBLIC_PINATA_JWT not configured');
  }
  const pinata = new PinataClient({ jwt: pinataJwt });
  const ipfsCid = await pinata.pinJSON({
    credentialString: credential,
    jti,
    vct: formData.credentialType,
    issuerDid,
    holderDid,
    issuedAt: new Date().toISOString(),
  });

  // 3. Build anchor event with IPFS CID + reused payloadSig (no second signData).
  const ts = new Date().toISOString();
  const event: Record<string, unknown> = {
    event: 'issue',
    issuerDid,
    holderDid,
    vcHash: jti,
    vcType: formData.credentialType,
    vcFormat: 'cose-sd',
    ipfsCid,
    ts,
    payloadSig: JSON.stringify(payloadSig),
  };

  // 4. Submit tx via Lucid (calls wallet.signTx)
  onProgress?.('anchoring-tx');
  const txHash = await submitVCEvent(wallet, event, networkConfig);

  return { credential, jti, txHash, ipfsCid };
}

/**
 * Fetch a credential payload from IPFS via Pinata gateway.
 * Returns the stored credential data or null on failure.
 */
export async function fetchCredentialFromIPFS(
  ipfsCid: string
): Promise<{ credentialString: string; jti: string; vct: string; issuerDid: string; holderDid: string; issuedAt: string } | null> {
  try {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsCid}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Create a selective-disclosure presentation from a stored credential.
 * Returns the presentation string and list of disclosed keys.
 */
export function createSelectivePresentation(
  credentialString: string,
  claimsToDisclose: string[]
): { presentation: string; disclosedKeys: string[] } {
  return createPresentation(credentialString, claimsToDisclose);
}

/**
 * Extract all disclosable claims from a credential string.
 * Returns claim key/value pairs for UI rendering.
 */
export function extractDisclosableClaims(
  credentialString: string
): Array<{ key: string; value: unknown }> {
  return getDisclosableClaims(credentialString);
}

/**
 * Revoke a credential by anchoring a revoke event on-chain.
 */
export async function revokeCredential(
  wallet: CIP30API,
  signingAddress: string,
  params: {
    issuerDid: string;
    holderDid: string;
    vcHash: string;
    vcType: string;
    reason?: string;
  },
  networkConfig: { network: string; blockfrostApiKey: string }
): Promise<{ txHash: string }> {
  const ts = new Date().toISOString();
  const fields: Record<string, unknown> = {
    event: 'revoke',
    issuerDid: params.issuerDid,
    holderDid: params.holderDid,
    vcHash: params.vcHash,
    vcType: params.vcType,
    vcFormat: 'cose-sd',
    ts,
  };
  if (params.reason) fields.reason = params.reason;

  const payloadSig = await signVCPayload(wallet, signingAddress, fields);
  const event = { ...fields, payloadSig: JSON.stringify(payloadSig) };
  const txHash = await submitVCEvent(wallet, event, networkConfig);
  return { txHash };
}

// ─── Indexer Queries ───

/** Fetch credential status from the VC Indexer.
 * Uses includeUnconfirmed=true so freshly-issued VCs show as pending (not 404). */
export async function fetchCredentialStatus(
  vcHash: string,
  indexerEndpoint: string
): Promise<VCStatus> {
  try {
    const res = await fetch(
      `${indexerEndpoint}/vc/${encodeURIComponent(vcHash)}/status?includeUnconfirmed=true`
    );
    if (!res.ok) return 'not_found';
    const data = (await res.json()) as { status?: string; confirmed?: boolean };
    if (data.status === 'revoked') return 'revoked';
    if (data.status === 'active') return data.confirmed === false ? 'pending' : 'active';
    return 'pending';
  } catch {
    return 'not_found';
  }
}

/** DTO for issuer credentials endpoint — matches indexer response shape */
export interface IssuerCredentialDTO {
  vcHash: string;
  holderDid: string;
  vcType: string;
  vcFormat: string;
  ipfsCid: string | null;
  txHash: string;
  confirmed: boolean;
  blockHeight: number;
  timestamp: string;
}

/** DTO for holder credentials endpoint — matches indexer response shape */
export interface HolderCredentialDTO {
  vcHash: string;
  issuerDid: string;
  vcType: string;
  vcFormat: string;
  ipfsCid: string | null;
  txHash: string;
  confirmed: boolean;
  blockHeight: number;
  timestamp: string;
}

/** Fetch all credentials issued by a DID from the indexer.
 * Uses includeUnconfirmed=true so freshly-issued VCs appear immediately. */
export async function fetchIssuerCredentials(
  issuerDid: string,
  indexerEndpoint: string
): Promise<IssuerCredentialDTO[]> {
  try {
    const res = await fetch(
      `${indexerEndpoint}/issuer/${encodeURIComponent(issuerDid)}/credentials?includeUnconfirmed=true`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { credentials?: IssuerCredentialDTO[] };
    return data.credentials ?? [];
  } catch {
    return [];
  }
}

/** Fetch all credentials held by a DID from the indexer.
 * Uses includeUnconfirmed=true so freshly-issued VCs appear immediately. */
export async function fetchHolderCredentials(
  holderDid: string,
  indexerEndpoint: string
): Promise<HolderCredentialDTO[]> {
  try {
    const res = await fetch(
      `${indexerEndpoint}/holder/${encodeURIComponent(holderDid)}/credentials?includeUnconfirmed=true`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { credentials?: HolderCredentialDTO[] };
    return data.credentials ?? [];
  } catch {
    return [];
  }
}

/**
 * Verify a presentation via the server-side API route.
 * Delegates to /api/verify which uses the Node.js SDK for COSE_Sign1 verification.
 * Indexer endpoint is resolved server-side from config (no SSRF risk).
 */
export async function verifyPresentation(
  presentationString: string,
  _indexerEndpoint?: string
): Promise<{
  valid: boolean;
  claims: Record<string, unknown>;
  issuer: string;
  holder: string;
  vct: string;
  jti: string;
  error?: string;
}> {
  const res = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presentationString }),
  });
  if (!res.ok) {
    return {
      valid: false,
      claims: {},
      issuer: '',
      holder: '',
      vct: '',
      jti: '',
      error: `Verification request failed: ${res.status}`,
    };
  }
  return res.json();
}
