import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CIP30API } from '@prisma-dids/types';
import { issueSDJwtVC, createPresentation } from './vc.js';
import { unpackCredential } from './sd-jwt.js';
import { utf8ToBytes } from '../utils/encoding.js';

// ─── Mock cose-verify.js (requires CSL-nodejs in production) ───

const mockVerify = vi.fn();

vi.mock('./cose-verify.js', () => ({
  verifyCoseSign1Signature: (...args: unknown[]) => mockVerify(...args),
}));

// Import AFTER mock setup
const { verifyPresentation } = await import('./vc-verify.js');

// ─── Helpers ───

const ISSUER_STAKE = 'stake_test1uztest_issuer';
const ISSUER = `did:cardano:${ISSUER_STAKE}`;
const HOLDER = 'did:cardano:stake_test1uztest_holder';
const SIGNING_ADDR = 'cafe'.repeat(16);
const VCT = 'ContributionCredential';

const VALID_CLAIMS = {
  projectId: 'proj-001',
  contributionType: 'code' as const,
  organization: 'Prisma',
  hours: 40,
  description: 'SDK development',
  evidenceUrl: 'https://github.com/example/pr/1',
};

function createMockWallet(): CIP30API {
  return {
    signData: vi.fn().mockResolvedValue({
      signature: 'a0'.repeat(32),
      key: 'b0'.repeat(32),
    }),
    getNetworkId: vi.fn(),
    getUsedAddresses: vi.fn(),
    getUnusedAddresses: vi.fn(),
    getBalance: vi.fn(),
    getUtxos: vi.fn(),
    getCollateral: vi.fn(),
    signTx: vi.fn(),
    submitTx: vi.fn(),
    getChangeAddress: vi.fn(),
    getRewardAddresses: vi.fn(),
  } as unknown as CIP30API;
}

/** Configure mockVerify to return a valid result matching the issuer stake */
function setupValidCoseVerify(payloadOverride?: Uint8Array) {
  mockVerify.mockImplementation(async (payloadSig: { sig: string; key: string; address: string }) => {
    // By default, use the address from the payloadSig to derive what we return
    // The test controls the issuer DID → we return the matching stake address
    return {
      valid: true,
      signerStakeAddress: ISSUER_STAKE,
      signedPayload: payloadOverride ?? undefined, // callers opt in
    };
  });
}

/**
 * Issue a credential and create a presentation for testing.
 * Returns both the full credential and a presentation with specified disclosed keys.
 */
async function issueAndPresent(disclosable: string[], disclose: string[]) {
  const wallet = createMockWallet();
  const { credential, jti } = await issueSDJwtVC(
    wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
    VALID_CLAIMS,
    { disclosable }
  );
  const { presentation, disclosedKeys } = createPresentation(credential, disclose);
  return { credential, presentation, jti, disclosedKeys };
}

describe('verifyPresentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: valid COSE, no payload binding check (signedPayload undefined)
    setupValidCoseVerify();
  });

  // ─────────────────────────────────────────────────────────────────
  // 2D.2: E2E issue → present → verify
  // ─────────────────────────────────────────────────────────────────
  describe('E2E: issue → present → verify (2D.2)', () => {
    it('should verify a presentation with 1 disclosed claim out of 3', async () => {
      const { presentation } = await issueAndPresent(
        ['hours', 'description', 'evidenceUrl'],
        ['hours']
      );

      const result = await verifyPresentation(presentation);

      expect(result.valid).toBe(true);
      expect(result.issuer).toBe(ISSUER);
      expect(result.holder).toBe(HOLDER);
      expect(result.vct).toBe(VCT);
      expect(result.jti).toMatch(/^urn:uuid:/);

      // Only the disclosed claim should appear
      expect(result.claims).toEqual({ hours: 40 });
      expect(result.claims.description).toBeUndefined();
      expect(result.claims.evidenceUrl).toBeUndefined();
    });

    it('should verify a presentation with all claims disclosed', async () => {
      const { presentation } = await issueAndPresent(
        ['hours', 'description', 'evidenceUrl'],
        ['hours', 'description', 'evidenceUrl']
      );

      const result = await verifyPresentation(presentation);

      expect(result.valid).toBe(true);
      expect(result.claims.hours).toBe(40);
      expect(result.claims.description).toBe('SDK development');
      expect(result.claims.evidenceUrl).toBe('https://github.com/example/pr/1');
    });

    it('should verify a presentation with zero disclosures', async () => {
      const { presentation } = await issueAndPresent(
        ['hours', 'description'],
        []
      );

      const result = await verifyPresentation(presentation);

      expect(result.valid).toBe(true);
      expect(result.claims).toEqual({});
    });

    it('should verify a credential with no disclosable claims (fully visible)', async () => {
      const { presentation } = await issueAndPresent([], []);

      const result = await verifyPresentation(presentation);

      expect(result.valid).toBe(true);
      // Non-disclosable claims are in the payload directly, not in claims
      expect(result.claims).toEqual({});
    });

    it('should include correct issuer DID from payload', async () => {
      const { presentation } = await issueAndPresent(['hours'], ['hours']);

      const result = await verifyPresentation(presentation);

      expect(result.issuer).toBe(ISSUER);
      expect(result.holder).toBe(HOLDER);
    });

    it('should call verifyCoseSign1Signature with payloadSig', async () => {
      const { presentation } = await issueAndPresent(['hours'], ['hours']);

      await verifyPresentation(presentation);

      expect(mockVerify).toHaveBeenCalledOnce();
      const callArg = mockVerify.mock.calls[0]![0] as { sig: string; key: string; address: string };
      expect(callArg.sig).toBe('a0'.repeat(32));
      expect(callArg.key).toBe('b0'.repeat(32));
      expect(callArg.address).toBe(SIGNING_ADDR);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Signature verification failures
  // ─────────────────────────────────────────────────────────────────
  describe('signature failures', () => {
    it('should fail if COSE_Sign1 signature is invalid', async () => {
      mockVerify.mockResolvedValue({ valid: false, error: 'invalid_signature' });

      const { presentation } = await issueAndPresent(['hours'], ['hours']);
      const result = await verifyPresentation(presentation);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_signature');
    });

    it('should fail if signer stake address does not match issuer DID', async () => {
      mockVerify.mockResolvedValue({
        valid: true,
        signerStakeAddress: 'stake_test1uz_wrong_address',
      });

      const { presentation } = await issueAndPresent(['hours'], ['hours']);
      const result = await verifyPresentation(presentation);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('signer_not_issuer');
    });

    it('should fail if payload binding check detects mismatch', async () => {
      // Return signedPayload that doesn't match the envelope payload
      const fakePayload = utf8ToBytes('{"tampered": true}');
      mockVerify.mockResolvedValue({
        valid: true,
        signerStakeAddress: ISSUER_STAKE,
        signedPayload: fakePayload,
      });

      const { presentation } = await issueAndPresent(['hours'], ['hours']);
      const result = await verifyPresentation(presentation);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('payload_mismatch');
    });

    it('should pass payload binding when signedPayload matches', async () => {
      const wallet = createMockWallet();
      const { credential } = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours'] }
      );
      const { presentation } = createPresentation(credential, ['hours']);

      // Extract the actual payload from the envelope to build matching signed bytes
      const { envelope } = unpackCredential(presentation);
      const expectedBytes = utf8ToBytes(JSON.stringify(envelope.payload));

      mockVerify.mockResolvedValue({
        valid: true,
        signerStakeAddress: ISSUER_STAKE,
        signedPayload: expectedBytes,
      });

      const result = await verifyPresentation(presentation);
      expect(result.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Disclosure hash verification
  // ─────────────────────────────────────────────────────────────────
  describe('disclosure hash verification', () => {
    it('should fail if a disclosure does not match any _sd hash', async () => {
      const wallet = createMockWallet();
      const { credential } = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours'] }
      );

      // Tamper: create a presentation with a fake disclosure
      const { envelope } = unpackCredential(credential);
      const fakeDisc = btoa(JSON.stringify(['fakesalt', 'hours', 999]))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const envelopePart = credential.split('~')[0]!;
      const tamperedPresentation = `${envelopePart}~${fakeDisc}~`;

      const result = await verifyPresentation(tamperedPresentation);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('disclosure_hash_mismatch');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 2D.5: jti hash strategy — same jti from different presentations
  // ─────────────────────────────────────────────────────────────────
  describe('jti hash strategy (2D.5)', () => {
    it('should resolve to same jti from two different presentations of same VC', async () => {
      const wallet = createMockWallet();
      const { credential, jti } = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours', 'description', 'evidenceUrl'] }
      );

      // Presentation 1: disclose only 'hours'
      const pres1 = createPresentation(credential, ['hours']);
      // Presentation 2: disclose only 'description'
      const pres2 = createPresentation(credential, ['description']);

      const result1 = await verifyPresentation(pres1.presentation);
      const result2 = await verifyPresentation(pres2.presentation);

      // Both should be valid
      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);

      // Both should have the SAME jti
      expect(result1.jti).toBe(jti);
      expect(result2.jti).toBe(jti);
      expect(result1.jti).toBe(result2.jti);

      // But different disclosed claims
      expect(result1.claims).toEqual({ hours: 40 });
      expect(result2.claims).toEqual({ description: 'SDK development' });
    });

    it('should resolve to same jti even with zero disclosures', async () => {
      const wallet = createMockWallet();
      const { credential, jti } = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours'] }
      );

      const full = createPresentation(credential, ['hours']);
      const empty = createPresentation(credential, []);

      const r1 = await verifyPresentation(full.presentation);
      const r2 = await verifyPresentation(empty.presentation);

      expect(r1.jti).toBe(jti);
      expect(r2.jti).toBe(jti);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 2D.3: Revocation check (mocked indexer)
  // ─────────────────────────────────────────────────────────────────
  describe('revocation check (2D.3)', () => {
    it('should fail verification when credential is revoked', async () => {
      // Mock fetch to simulate revoked status from indexer
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'revoked' }), { status: 200 })
      );

      const { presentation, jti } = await issueAndPresent(['hours'], ['hours']);

      const result = await verifyPresentation(presentation, {
        checkRevocation: true,
        indexerEndpoint: 'https://vc-indexer.example.com',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('credential_revoked');

      // Verify the correct URL was called
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/vc/')
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/status')
      );

      fetchSpy.mockRestore();
    });

    it('should pass verification when credential is active', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'active' }), { status: 200 })
      );

      const { presentation } = await issueAndPresent(['hours'], ['hours']);

      const result = await verifyPresentation(presentation, {
        checkRevocation: true,
        indexerEndpoint: 'https://vc-indexer.example.com',
      });

      expect(result.valid).toBe(true);

      fetchSpy.mockRestore();
    });

    it('should skip revocation check when checkRevocation is false', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const { presentation } = await issueAndPresent(['hours'], ['hours']);

      const result = await verifyPresentation(presentation, {
        checkRevocation: false,
        indexerEndpoint: 'https://vc-indexer.example.com',
      });

      expect(result.valid).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it('should skip revocation check when no indexerEndpoint', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const { presentation } = await issueAndPresent(['hours'], ['hours']);

      const result = await verifyPresentation(presentation, {
        checkRevocation: true,
      });

      expect(result.valid).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it('should use jti as vcHash in revocation URL', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'active' }), { status: 200 })
      );

      const { presentation, jti } = await issueAndPresent(['hours'], ['hours']);

      await verifyPresentation(presentation, {
        checkRevocation: true,
        indexerEndpoint: 'https://vc-indexer.example.com',
      });

      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toBe(
        `https://vc-indexer.example.com/vc/${encodeURIComponent(jti)}/status`
      );

      fetchSpy.mockRestore();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Error handling
  // ─────────────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('should return error result for malformed presentation string', async () => {
      const result = await verifyPresentation('not-a-valid-credential');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('verify_exception');
    });

    it('should return error result when COSE verify throws', async () => {
      mockVerify.mockRejectedValue(new Error('CSL not available'));

      const { presentation } = await issueAndPresent(['hours'], ['hours']);
      const result = await verifyPresentation(presentation);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('verify_exception');
    });
  });
});
