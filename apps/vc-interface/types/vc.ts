/**
 * VC Interface Types
 * Types for the forkable VC Interface components
 */

/** Status of a Verifiable Credential */
export type VCStatus = 'active' | 'revoked' | 'pending' | 'not_found';

/** Credential types supported by Prisma DIDs */
export type CredentialType = 'ContributionCredential' | 'MembershipCredential' | 'AchievementCredential';

/** A claim within a Verifiable Credential */
export interface VCClaim {
  key: string;
  value: string | number | boolean;
  disclosable: boolean;
}

/** Represents a Verifiable Credential in the UI */
export interface VerifiableCredential {
  /** Unique identifier (jti) */
  id: string;
  /** Credential type (e.g., ContributionCredential) */
  type: CredentialType;
  /** Issuer's DID */
  issuerDid: string;
  /** Holder's DID */
  holderDid: string;
  /** Issuance date */
  issuedAt: string;
  /** Expiration date (optional) */
  expiresAt?: string;
  /** Current status */
  status: VCStatus;
  /** Claims contained in the credential */
  claims: VCClaim[];
  /** Transaction hash where VC was anchored */
  txHash?: string;
  /** IPFS CID of the full credential */
  ipfsCid?: string;
  /** Full COSE-SD wire format string (for selective disclosure) */
  credentialString?: string;
}

/** Revocation reason options */
export type RevocationReason =
  | 'issued_in_error'
  | 'holder_request'
  | 'policy_violation'
  | 'expired'
  | 'other';

/** Revocation request data */
export interface RevocationRequest {
  credentialId: string;
  reason: RevocationReason;
  customReason?: string;
}

/** Claim fields for ContributionCredential — re-exported from @prisma-dids/schemas (Audit Fix #6) */
export type { ContributionCredential as ContributionCredentialClaims } from '@prisma-dids/schemas';
export { ContributionTypeEnum } from '@prisma-dids/schemas';

/** Issuance form data */
export interface IssuanceFormData {
  holderDid: string;
  credentialType: CredentialType;
  claims: Record<string, string | number | boolean>;
  disclosableClaims: string[];
}

/** Selective disclosure presentation data */
export interface PresentationData {
  credentialId: string;
  selectedClaims: string[];
}
