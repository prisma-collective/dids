import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CIP30API } from '@prisma-dids/types';
import { issueSDJwtVC, createPresentation, getDisclosableClaims } from './vc.js';
import { unpackCredential, decodeDisclosure, verifyDisclosureHash } from './sd-jwt.js';

// ─── Mock wallet ───

function createMockWallet(): CIP30API {
  return {
    signData: vi.fn().mockResolvedValue({
      signature: 'a0'.repeat(32), // dummy COSE_Sign1 hex
      key: 'b0'.repeat(32),       // dummy COSE_Key hex
    }),
    // Stubs for unused methods
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

const ISSUER = 'did:cardano:stake_test1uztest_issuer';
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

describe('vc', () => {
  let wallet: CIP30API;

  beforeEach(() => {
    wallet = createMockWallet();
  });

  // ─────────────────────────────────────────────────────────────────
  // issueSDJwtVC
  // ─────────────────────────────────────────────────────────────────
  describe('issueSDJwtVC', () => {
    it('should produce valid COSE-SD wire format', async () => {
      const result = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours', 'description', 'evidenceUrl'] }
      );

      // Wire format: base64url(envelope)~disc1~disc2~disc3~
      expect(result.credential).toContain('~');
      const parts = result.credential.split('~');
      // envelope + 3 disclosures + trailing empty = 5 parts
      expect(parts.length).toBe(5);
      expect(parts[parts.length - 1]).toBe(''); // trailing ~
    });

    it('should set jti in urn:uuid format', async () => {
      const result = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours'] }
      );

      expect(result.jti).toMatch(
        /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should include _sd array with hashes for disclosable claims', async () => {
      const result = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours', 'description'] }
      );

      const { envelope } = unpackCredential(result.credential);
      const sd = envelope.payload._sd as string[];
      expect(sd).toHaveLength(2);
      // Each hash is a base64url string
      for (const hash of sd) {
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(0);
      }
    });

    it('should keep non-disclosable claims in payload directly', async () => {
      const result = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours'] }
      );

      const { envelope } = unpackCredential(result.credential);
      // Non-disclosable claims should be in the payload
      expect(envelope.payload.projectId).toBe('proj-001');
      expect(envelope.payload.contributionType).toBe('code');
      expect(envelope.payload.organization).toBe('Prisma');
      // Disclosable claim should NOT be in payload
      expect(envelope.payload.hours).toBeUndefined();
    });

    it('should set protocol fields correctly and prevent overwrites', async () => {
      // iss, sub, vct, iat are RESERVED_KEYS — input claims can't overwrite them
      const claimsWithOverwrite = {
        ...VALID_CLAIMS,
        iss: 'did:cardano:attacker', // attempt to overwrite issuer
      };

      const result = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        claimsWithOverwrite,
        { disclosable: [] }
      );

      const { envelope } = unpackCredential(result.credential);
      expect(envelope.payload.iss).toBe(ISSUER); // not attacker
      expect(envelope.payload.sub).toBe(HOLDER);
      expect(envelope.payload.vct).toBe(VCT);
      expect(envelope.payload.jti).toMatch(/^urn:uuid:/);
      expect(typeof envelope.payload.iat).toBe('number');
    });

    it('should produce payloadSig from wallet.signData()', async () => {
      const result = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: [] }
      );

      expect(result.payloadSig).toBeDefined();
      expect(result.payloadSig.sig).toBe('a0'.repeat(32));
      expect(result.payloadSig.key).toBe('b0'.repeat(32));
      expect(result.payloadSig.address).toBe(SIGNING_ADDR);

      // Wallet should have been called with the signing address
      expect(wallet.signData).toHaveBeenCalledWith(SIGNING_ADDR, expect.any(String));
    });

    it('should set envelope header with alg and vct', async () => {
      const result = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: [] }
      );

      const { envelope } = unpackCredential(result.credential);
      expect(envelope.header.alg).toBe('EdDSA-COSE');
      expect(envelope.header.vct).toBe(VCT);
    });

    it('should create disclosures that match _sd hashes', async () => {
      const result = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours', 'description'] }
      );

      const { envelope, disclosureStrings } = unpackCredential(result.credential);
      const sdArray = envelope.payload._sd as string[];

      expect(disclosureStrings).toHaveLength(2);

      // Each disclosure should match a hash in _sd
      for (const disc of disclosureStrings) {
        let matched = false;
        for (const hash of sdArray) {
          if (await verifyDisclosureHash(disc, hash)) {
            matched = true;
            break;
          }
        }
        expect(matched).toBe(true);
      }
    });

    it('should omit _sd when no disclosable claims', async () => {
      const result = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: [] }
      );

      const { envelope } = unpackCredential(result.credential);
      expect(envelope.payload._sd).toBeUndefined();
    });

    // ─── Schema validation ───

    it('should reject claims that fail schema validation', async () => {
      const invalidClaims = {
        projectId: '', // min length 1
        contributionType: 'invalid_type',
        organization: 'Prisma',
      };

      await expect(
        issueSDJwtVC(
          wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
          invalidClaims,
          { disclosable: [] }
        )
      ).rejects.toThrow('Schema validation failed');
    });

    it('should reject invalid disclosable keys', async () => {
      await expect(
        issueSDJwtVC(
          wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
          VALID_CLAIMS,
          { disclosable: ['projectId'] } // projectId is not disclosable
        )
      ).rejects.toThrow('Invalid disclosable keys');
    });

    it('should allow issuance for unknown vct (no schema registered)', async () => {
      const result = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, 'UnknownCredential',
        { foo: 'bar' },
        { disclosable: ['foo'] }
      );

      expect(result.jti).toMatch(/^urn:uuid:/);
      expect(result.credential).toContain('~');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // createPresentation
  // ─────────────────────────────────────────────────────────────────
  describe('createPresentation', () => {
    it('should create presentation with only selected disclosures', async () => {
      const { credential } = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours', 'description', 'evidenceUrl'] }
      );

      const { presentation, disclosedKeys } = createPresentation(credential, ['hours']);

      expect(disclosedKeys).toEqual(['hours']);

      // Presentation should have only 1 disclosure
      const parts = presentation.split('~');
      const disclosures = parts.slice(1).filter(s => s.length > 0);
      expect(disclosures).toHaveLength(1);

      // The disclosed claim should be 'hours' with value 40
      const { key, value } = decodeDisclosure(disclosures[0]!);
      expect(key).toBe('hours');
      expect(value).toBe(40);
    });

    it('should create presentation with multiple disclosures', async () => {
      const { credential } = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours', 'description', 'evidenceUrl'] }
      );

      const { disclosedKeys } = createPresentation(
        credential,
        ['hours', 'evidenceUrl']
      );

      expect(disclosedKeys).toHaveLength(2);
      expect(disclosedKeys).toContain('hours');
      expect(disclosedKeys).toContain('evidenceUrl');
    });

    it('should create presentation with zero disclosures', async () => {
      const { credential } = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours'] }
      );

      const { presentation, disclosedKeys } = createPresentation(credential, []);

      expect(disclosedKeys).toEqual([]);
      // Only envelope + trailing ~
      const parts = presentation.split('~');
      expect(parts.filter(s => s.length > 0)).toHaveLength(1); // just envelope
    });

    it('should preserve envelope (payload + payloadSig) across presentations', async () => {
      const { credential } = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours', 'description'] }
      );

      const { presentation } = createPresentation(credential, ['hours']);
      const { envelope } = unpackCredential(presentation);

      expect(envelope.payload.iss).toBe(ISSUER);
      expect(envelope.payload.sub).toBe(HOLDER);
      expect(envelope.payload.vct).toBe(VCT);
      expect(envelope.payloadSig.sig).toBe('a0'.repeat(32));
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // getDisclosableClaims
  // ─────────────────────────────────────────────────────────────────
  describe('getDisclosableClaims', () => {
    it('should extract all disclosable claims from full credential', async () => {
      const { credential } = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: ['hours', 'description', 'evidenceUrl'] }
      );

      const claims = getDisclosableClaims(credential);

      expect(claims).toHaveLength(3);
      const keys = claims.map(c => c.key);
      expect(keys).toContain('hours');
      expect(keys).toContain('description');
      expect(keys).toContain('evidenceUrl');

      const hoursClaim = claims.find(c => c.key === 'hours');
      expect(hoursClaim!.value).toBe(40);
    });

    it('should return empty array when no disclosable claims', async () => {
      const { credential } = await issueSDJwtVC(
        wallet, SIGNING_ADDR, ISSUER, HOLDER, VCT,
        VALID_CLAIMS,
        { disclosable: [] }
      );

      const claims = getDisclosableClaims(credential);
      expect(claims).toEqual([]);
    });
  });
});
