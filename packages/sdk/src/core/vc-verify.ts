/**
 * COSE-SD presentation verification (Node.js only).
 *
 * Separated from vc.ts so the browser entrypoint can import vc.ts
 * without pulling in cardano-serialization-lib-nodejs via cose-verify.js.
 *
 * NOTE: This module requires Node.js — it dynamically imports cose-verify.js
 * which depends on @emurgo/cardano-serialization-lib-nodejs.
 */
import { utf8ToBytes } from '../utils/encoding.js';
import {
  unpackCredential,
  decodeDisclosure,
  verifyDisclosureHash,
} from './sd-jwt.js';
import type { VerificationResult } from './vc.js';

// ─── Verify ───

/**
 * Verify a COSE-SD presentation.
 *
 * Process:
 * 1. Split presentation into envelope + disclosures
 * 2. Verify COSE_Sign1 signature via shared verifyCoseSign1Signature()
 * 3. Verify each disclosure matches its _sd hash
 * 4. Extract disclosed claims
 * 5. Optionally check revocation via indexer
 *
 * NOTE: COSE_Sign1 verification requires Node.js (cardano-serialization-lib).
 * This function imports verifyCoseSign1Signature dynamically.
 */
export async function verifyPresentation(
  presentationString: string,
  options?: { checkRevocation?: boolean; indexerEndpoint?: string }
): Promise<VerificationResult> {
  try {
    // 1. Unpack
    const { envelope, disclosureStrings } = unpackCredential(presentationString);
    const { payload, payloadSig } = envelope;

    // 2. Verify COSE_Sign1 signature
    const { verifyCoseSign1Signature } = await import('./cose-verify.js');
    const coseResult = await verifyCoseSign1Signature(payloadSig);

    if (!coseResult.valid) {
      return {
        valid: false,
        claims: {},
        issuer: String(payload.iss ?? ''),
        holder: String(payload.sub ?? ''),
        vct: String(payload.vct ?? ''),
        jti: String(payload.jti ?? ''),
        error: coseResult.error ?? 'invalid_signature',
      };
    }

    // 3. Verify payload binding — signed bytes must match the payload in envelope
    if (coseResult.signedPayload) {
      const expectedPayload = JSON.stringify(payload);
      const expectedBytes = utf8ToBytes(expectedPayload);
      if (!bytesEqual(coseResult.signedPayload, expectedBytes)) {
        return {
          valid: false,
          claims: {},
          issuer: String(payload.iss ?? ''),
          holder: String(payload.sub ?? ''),
          vct: String(payload.vct ?? ''),
          jti: String(payload.jti ?? ''),
          error: 'payload_mismatch',
        };
      }
    }

    // 4. Verify issuer matches signer
    const issuerDid = String(payload.iss ?? '');
    const issuerStake = issuerDid.replace('did:cardano:', '');
    if (coseResult.signerStakeAddress !== issuerStake) {
      return {
        valid: false,
        claims: {},
        issuer: issuerDid,
        holder: String(payload.sub ?? ''),
        vct: String(payload.vct ?? ''),
        jti: String(payload.jti ?? ''),
        error: 'signer_not_issuer',
      };
    }

    // 5. Verify disclosures match _sd hashes
    const sdArray = (payload._sd ?? []) as string[];
    const claims: Record<string, unknown> = {};

    for (const disc of disclosureStrings) {
      const { key, value } = decodeDisclosure(disc);
      // Verify hash is in _sd
      let found = false;
      for (const expectedHash of sdArray) {
        if (await verifyDisclosureHash(disc, expectedHash)) {
          found = true;
          break;
        }
      }
      if (!found) {
        return {
          valid: false,
          claims,
          issuer: issuerDid,
          holder: String(payload.sub ?? ''),
          vct: String(payload.vct ?? ''),
          jti: String(payload.jti ?? ''),
          error: `disclosure_hash_mismatch:${key}`,
        };
      }
      claims[key] = value;
    }

    // 6. Optionally check revocation
    if (options?.checkRevocation && options.indexerEndpoint) {
      const jti = String(payload.jti ?? '');
      const statusUrl = `${options.indexerEndpoint}/vc/${encodeURIComponent(jti)}/status`;
      const response = await fetch(statusUrl);
      if (response.ok) {
        const status = await response.json() as { status: string };
        if (status.status === 'revoked') {
          return {
            valid: false,
            claims,
            issuer: issuerDid,
            holder: String(payload.sub ?? ''),
            vct: String(payload.vct ?? ''),
            jti,
            error: 'credential_revoked',
          };
        }
      }
    }

    return {
      valid: true,
      claims,
      issuer: issuerDid,
      holder: String(payload.sub ?? ''),
      vct: String(payload.vct ?? ''),
      jti: String(payload.jti ?? ''),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      claims: {},
      issuer: '',
      holder: '',
      vct: '',
      jti: '',
      error: `verify_exception: ${message}`,
    };
  }
}

// ─── Utility ───

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
