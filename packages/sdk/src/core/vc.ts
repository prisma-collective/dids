/**
 * Verifiable Credential issuance, presentation, and verification.
 *
 * Uses the COSE-SD format: SD-JWT disclosure mechanism + COSE_Sign1 signing
 * via CIP-30 wallet.signData(). Private keys never leave the wallet.
 *
 * Reference: P2 Implementation Plan §Phase 2, TECHNICAL_DESIGN §7
 */
import type { CIP30API, PrismaPayloadSig } from '@prisma-events/dids-types';
import { getSchema } from '@prisma-events/dids-schemas';
import { utf8ToBytes, bytesToHex } from '../utils/encoding.js';
import {
  createDisclosures,
  packCredential,
  unpackCredential,
  decodeDisclosure,
  base64urlEncodeString,
  type CoseSDEnvelope,
} from './sd-jwt.js';

// ─── Types ───

export interface IssueVCOptions {
  /** Which claim keys support selective disclosure */
  disclosable: string[];
}

export interface IssuedVC {
  /** Full COSE-SD credential string (wire format) */
  credential: string;
  /** Credential unique identifier (urn:uuid format) */
  jti: string;
  /** COSE_Sign1 signature wrapper */
  payloadSig: PrismaPayloadSig;
}

export interface PresentationResult {
  /** Presentation string (subset of disclosures) */
  presentation: string;
  /** Keys that were disclosed */
  disclosedKeys: string[];
}

export interface VerificationResult {
  /** Whether the presentation is valid */
  valid: boolean;
  /** Disclosed claims (key→value) */
  claims: Record<string, unknown>;
  /** Issuer DID */
  issuer: string;
  /** Holder DID */
  holder: string;
  /** Credential type */
  vct: string;
  /** Credential ID */
  jti: string;
  /** Error message if invalid */
  error?: string;
}

export interface DisclosableClaim {
  /** Claim key */
  key: string;
  /** Claim value */
  value: unknown;
}

// ─── Issue ───

/**
 * Issue a COSE-SD Verifiable Credential.
 *
 * Process:
 * 1. Generate jti as urn:uuid
 * 2. For each disclosable claim: create disclosure [salt, key, value], compute _sd hash
 * 3. Build payload with non-disclosable claims + _sd array
 * 4. Sign payload via CIP-30 wallet.signData() → COSE_Sign1
 * 5. Pack into wire format: base64url(envelope)~disc1~disc2~
 *
 * @param wallet - CIP-30 wallet API
 * @param signingAddress - Hex-encoded signing address (CIP-30 native)
 * @param issuerDid - Issuer's DID (did:cardano:stake...)
 * @param holderDid - Holder's DID (did:cardano:stake...)
 * @param vct - Credential type discriminator (e.g., 'ContributionCredential')
 * @param claims - All credential claims (both disclosable and non-disclosable)
 * @param options - Issuance options (disclosable field list)
 */
export async function issueSDJwtVC(
  wallet: CIP30API,
  signingAddress: string,
  issuerDid: string,
  holderDid: string,
  vct: string,
  claims: Record<string, unknown>,
  options: IssueVCOptions
): Promise<IssuedVC> {
  // 0. Validate claims against schema registry
  const schemaEntry = getSchema(vct);
  if (schemaEntry) {
    // Build full credential object for validation (base fields + domain claims)
    const fullCredential = {
      iss: issuerDid,
      sub: holderDid,
      jti: 'urn:uuid:00000000-0000-0000-0000-000000000000', // placeholder for validation
      iat: Math.floor(Date.now() / 1000),
      vct,
      ...claims,
    };
    const parseResult = schemaEntry.schema.safeParse(fullCredential);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map(
        (i: { path: (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`
      );
      throw new Error(`Schema validation failed for ${vct}: ${issues.join('; ')}`);
    }

    // Validate disclosable keys are recognized by the schema
    const allowedDisclosable = new Set(schemaEntry.disclosableFields);
    const invalidKeys = options.disclosable.filter(k => !allowedDisclosable.has(k));
    if (invalidKeys.length > 0) {
      throw new Error(
        `Invalid disclosable keys for ${vct}: ${invalidKeys.join(', ')}. ` +
        `Allowed: ${[...allowedDisclosable].join(', ')}`
      );
    }
  }

  // 1. Generate unique credential ID
  const jti = `urn:uuid:${crypto.randomUUID()}`;
  const iat = Math.floor(Date.now() / 1000);

  // 2. Create disclosures for selective-disclosure claims
  const { disclosures, sdArray } = await createDisclosures(claims, options.disclosable);

  // 3. Build payload — non-disclosable claims stay in the payload directly;
  //    disclosable claims are replaced by their hashes in _sd.
  //    Reserved protocol fields are stripped from input claims to prevent overwrites.
  const RESERVED_KEYS = new Set(['iss', 'sub', 'jti', 'iat', 'vct', '_sd']);
  const nonDisclosableClaims: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(claims)) {
    if (!options.disclosable.includes(key) && !RESERVED_KEYS.has(key)) {
      nonDisclosableClaims[key] = value;
    }
  }

  // Core fields are set AFTER spread so they can never be overwritten by input claims
  const payload: Record<string, unknown> = {
    ...nonDisclosableClaims,
    iss: issuerDid,
    sub: holderDid,
    jti,
    iat,
    vct,
  };

  if (sdArray.length > 0) {
    payload._sd = sdArray;
  }

  // 4. Sign the payload via CIP-30
  const payloadStr = JSON.stringify(payload);
  const payloadBytes = utf8ToBytes(payloadStr);
  const payloadHex = bytesToHex(payloadBytes);

  const { signature, key } = await wallet.signData(signingAddress, payloadHex);
  const payloadSig: PrismaPayloadSig = {
    sig: signature,
    key,
    address: signingAddress,
  };

  // 5. Pack into wire format
  const envelope: CoseSDEnvelope = {
    header: { alg: 'EdDSA-COSE', vct },
    payload,
    payloadSig,
  };

  const credential = packCredential(envelope, disclosures);
  return { credential, jti, payloadSig };
}

// ─── Present ───

/**
 * Create a selective-disclosure presentation from a full credential.
 *
 * Process:
 * 1. Parse credential into envelope + disclosures
 * 2. Decode each disclosure to find its claim key
 * 3. Filter disclosures to include only selected claims
 * 4. Reassemble: envelope~selected_disc1~selected_disc2~
 */
export function createPresentation(
  credentialString: string,
  claimsToDisclose: string[]
): PresentationResult {
  const { envelope, disclosureStrings } = unpackCredential(credentialString);

  const selectedDisclosures: string[] = [];
  const disclosedKeys: string[] = [];

  for (const disc of disclosureStrings) {
    const { key } = decodeDisclosure(disc);
    if (claimsToDisclose.includes(key)) {
      selectedDisclosures.push(disc);
      disclosedKeys.push(key);
    }
  }

  // Reassemble: envelope~disc1~disc2~...~
  const envelopePart = base64urlEncodeString(JSON.stringify(envelope));
  const presentation = [envelopePart, ...selectedDisclosures, ''].join('~');

  return { presentation, disclosedKeys };
}

// ─── Get Disclosable Claims ───

/**
 * Extract all disclosable claims from a full credential (with all disclosures).
 *
 * Process:
 * 1. Parse all disclosures from the credential string
 * 2. Decode each [salt, key, value] triple
 * 3. Return claim key/value pairs for UI rendering
 */
export function getDisclosableClaims(credentialString: string): DisclosableClaim[] {
  const { disclosureStrings } = unpackCredential(credentialString);
  return disclosureStrings.map(disc => {
    const { key, value } = decodeDisclosure(disc);
    return { key, value };
  });
}
