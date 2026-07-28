import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vcEventProcessor, jsonPayloadMatch, buildExpectedIssueAnchor, isLegacyCredentialSignedPayload } from './vc-processor.js';
import { VCEventPayloadSchema } from '@prisma-dids/schemas';
import type { VCEventPayload } from '@prisma-dids/schemas';
import type { MetadataEvent } from '../sources/types.js';
import type { ProcessedResult } from './types.js';

vi.mock('@prisma-dids/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@prisma-dids/sdk')>();
  return {
    ...actual,
    verifyCoseSign1Signature: vi.fn(),
  };
});

import { verifyCoseSign1Signature } from '@prisma-dids/sdk';

const mockVerifyCose = vi.mocked(verifyCoseSign1Signature);

/**
 * 2D.4: Integration tests — VC processor makeRow + schema validation.
 *
 * Tests that:
 * - VCEventPayloadSchema validates correct events and rejects invalid ones
 * - makeRow maps raw metadata events to vc_events table rows
 */

// ─── Helpers ───

const ISSUER_DID = 'did:cardano:stake_test1uzissuer';
const HOLDER_DID = 'did:cardano:stake_test1uzholder';
const VC_HASH = 'urn:uuid:12345678-1234-1234-1234-123456789012';
const ISSUER_STAKE = 'stake_test1uzissuer';

function makeRawEvent(overrides: Partial<MetadataEvent> = {}): MetadataEvent {
  return {
    txHash: 'tx_abc123',
    txIndex: 2,
    blockHeight: 5000,
    blockHash: 'block_hash',
    blockTime: Math.floor(Date.now() / 1000),
    jsonMetadata: { some: 'metadata' },
    ...overrides,
  };
}

function makeVCEventPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event: 'issue',
    issuerDid: ISSUER_DID,
    holderDid: HOLDER_DID,
    vcHash: VC_HASH,
    vcType: 'ContributionCredential',
    vcFormat: 'cose-sd',
    payloadSig: JSON.stringify({ sig: 'aa', key: 'bb', address: 'cc' }),
    ts: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('vc-processor', () => {
  // ─── Schema validation ───

  describe('VCEventPayloadSchema', () => {
    it('should validate a correct issue event', () => {
      const payload = makeVCEventPayload();
      const result = VCEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate a validate event with validatorDid', () => {
      const payload = makeVCEventPayload({
        event: 'validate',
        validatorDid: 'did:cardano:stake_test1uzvalidator',
      });
      const result = VCEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate a revoke event with reason', () => {
      const payload = makeVCEventPayload({
        event: 'revoke',
        reason: 'issued_in_error',
      });
      const result = VCEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject revoke event with free-text reason (F-META-03)', () => {
      const payload = makeVCEventPayload({
        event: 'revoke',
        reason: 'Revoked: personal data in free text',
      });
      const result = VCEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should accept all allowlisted revocation reasons', () => {
      const reasons = [
        'issued_in_error',
        'holder_request',
        'policy_violation',
        'expired',
        'compromised',
        'withdrawn_by_holder',
      ] as const;
      for (const reason of reasons) {
        const result = VCEventPayloadSchema.safeParse(
          makeVCEventPayload({ event: 'revoke', reason })
        );
        expect(result.success).toBe(true);
      }
    });

    it('should reject event with missing required fields', () => {
      const payload = { event: 'issue' }; // missing everything else
      const result = VCEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject unknown event type', () => {
      const payload = makeVCEventPayload({ event: 'unknown' });
      const result = VCEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid vcFormat', () => {
      const payload = makeVCEventPayload({ vcFormat: 'invalid' });
      const result = VCEventPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // ─── makeRow ───

  describe('makeRow', () => {
    it('should map issue event fields to vc_events row', () => {
      const raw = makeRawEvent();
      const reconstructed = makeVCEventPayload();
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: ISSUER_STAKE },
      };

      const row = vcEventProcessor.makeRow(raw, reconstructed, processedResult);

      expect(row.txHash).toBe('tx_abc123');
      expect(row.txIndex).toBe(2);
      expect(row.event).toBe('issue');
      expect(row.issuerDid).toBe(ISSUER_DID);
      expect(row.holderDid).toBe(HOLDER_DID);
      expect(row.vcHash).toBe(VC_HASH);
      expect(row.vcType).toBe('ContributionCredential');
      expect(row.vcFormat).toBe('cose-sd');
      expect(row.signerStakeAddress).toBe(ISSUER_STAKE);
      expect(row.valid).toBe(true);
      expect(row.confirmed).toBe(false); // events start unconfirmed
      expect(row.blockHeight).toBe(5000);
    });

    it('should set validatorDid for validate events', () => {
      const raw = makeRawEvent();
      const reconstructed = makeVCEventPayload({
        event: 'validate',
        validatorDid: 'did:cardano:stake_test1uzvalidator',
      });
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: 'stake_test1uzvalidator' },
      };

      const row = vcEventProcessor.makeRow(raw, reconstructed, processedResult);

      expect(row.validatorDid).toBe('did:cardano:stake_test1uzvalidator');
      expect(row.event).toBe('validate');
    });

    it('should set reason for revoke events', () => {
      const raw = makeRawEvent();
      const reconstructed = makeVCEventPayload({
        event: 'revoke',
        reason: 'expired',
      });
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: ISSUER_STAKE },
      };

      const row = vcEventProcessor.makeRow(raw, reconstructed, processedResult);

      expect(row.reason).toBe('expired');
      expect(row.event).toBe('revoke');
    });

    it('should handle null txIndex', () => {
      const raw = makeRawEvent({ txIndex: undefined });
      const reconstructed = makeVCEventPayload();
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: ISSUER_STAKE },
      };

      const row = vcEventProcessor.makeRow(raw, reconstructed, processedResult);
      expect(row.txIndex).toBeNull();
    });

    it('should mark row as invalid when verification fails', () => {
      const raw = makeRawEvent();
      const reconstructed = makeVCEventPayload();
      const processedResult: ProcessedResult = {
        valid: false,
        validationError: 'signer_not_issuer',
        verifyResult: { valid: false, signerStakeAddress: 'stake_test1uz_wrong' },
      };

      const row = vcEventProcessor.makeRow(raw, reconstructed, processedResult);

      expect(row.valid).toBe(false);
      expect(row.validationError).toBe('signer_not_issuer');
    });

    it('should convert blockTime to timestamp Date', () => {
      const blockTime = 1704067200; // 2024-01-01T00:00:00Z
      const raw = makeRawEvent({ blockTime });
      const reconstructed = makeVCEventPayload();
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: ISSUER_STAKE },
      };

      const row = vcEventProcessor.makeRow(raw, reconstructed, processedResult);
      expect(row.timestamp).toEqual(new Date(blockTime * 1000));
    });

    it('should store raw metadata as JSON string', () => {
      const raw = makeRawEvent({ jsonMetadata: { event: 'issue', data: 'test' } });
      const reconstructed = makeVCEventPayload();
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: ISSUER_STAKE },
      };

      const row = vcEventProcessor.makeRow(raw, reconstructed, processedResult);
      expect(JSON.parse(row.rawEvent as string)).toEqual({ event: 'issue', data: 'test' });
    });
  });

  // ─── Processor table reference ───

  it('should reference the vcEvents table', () => {
    // Config invariant: processor.table is the drizzle table for vc_events
    expect(vcEventProcessor.table).toBeDefined();
  });

  it('should use VCEventPayloadSchema', () => {
    expect(vcEventProcessor.schema).toBe(VCEventPayloadSchema);
  });

  // ─── jsonPayloadMatch ───

  describe('jsonPayloadMatch', () => {
    const encode = (obj: Record<string, unknown>) =>
      new TextEncoder().encode(JSON.stringify(obj));

    it('should match identical payloads', () => {
      const payload = { event: 'revoke', vcHash: 'urn:uuid:1', ts: '2025-01-01T00:00:00.000Z' };
      expect(jsonPayloadMatch(encode(payload), payload)).toBe(true);
    });

    it('should match payloads with different key order', () => {
      const signed = encode({ ts: '2025-01-01T00:00:00.000Z', event: 'revoke', reason: 'expired', vcHash: 'urn:uuid:1' });
      const expected = { event: 'revoke', vcHash: 'urn:uuid:1', reason: 'expired', ts: '2025-01-01T00:00:00.000Z' };
      expect(jsonPayloadMatch(signed, expected)).toBe(true);
    });

    it('should reject when signed payload has extra keys', () => {
      const signed = encode({ event: 'revoke', vcHash: 'urn:uuid:1', ts: '2025-01-01T00:00:00.000Z', extra: 'field' });
      const expected = { event: 'revoke', vcHash: 'urn:uuid:1', ts: '2025-01-01T00:00:00.000Z' };
      expect(jsonPayloadMatch(signed, expected)).toBe(false);
    });

    it('should reject when values differ', () => {
      const signed = encode({ event: 'revoke', vcHash: 'urn:uuid:WRONG', ts: '2025-01-01T00:00:00.000Z' });
      const expected = { event: 'revoke', vcHash: 'urn:uuid:1', ts: '2025-01-01T00:00:00.000Z' };
      expect(jsonPayloadMatch(signed, expected)).toBe(false);
    });

    it('should return false for invalid bytes', () => {
      expect(jsonPayloadMatch(new Uint8Array([0xFF, 0xFE]), { event: 'revoke' })).toBe(false);
    });
  });

  // ─── buildExpectedIssueAnchor / legacy detection ───

  describe('buildExpectedIssueAnchor', () => {
    it('should include only signed anchor fields (not ipfsCid)', () => {
      const event = makeVCEventPayload({ ipfsCid: 'QmTest123' }) as VCEventPayload;
      expect(buildExpectedIssueAnchor(event)).toEqual({
        event: 'issue',
        issuerDid: ISSUER_DID,
        holderDid: HOLDER_DID,
        vcHash: VC_HASH,
        vcType: 'ContributionCredential',
        vcFormat: 'cose-sd',
        ts: '2025-01-01T00:00:00.000Z',
      });
    });
  });

  describe('isLegacyCredentialSignedPayload', () => {
    const encode = (obj: Record<string, unknown>) =>
      new TextEncoder().encode(JSON.stringify(obj));

    it('should detect credential-shaped signed payloads', () => {
      expect(isLegacyCredentialSignedPayload(encode({
        iss: ISSUER_DID,
        sub: HOLDER_DID,
        jti: VC_HASH,
        vct: 'ContributionCredential',
      }))).toBe(true);
    });

    it('should reject minimal anchor payloads', () => {
      expect(isLegacyCredentialSignedPayload(encode(
        buildExpectedIssueAnchor(makeVCEventPayload() as VCEventPayload)
      ))).toBe(false);
    });
  });

  // ─── verify (issue event, F-META-01) ───

  describe('verify — issue events', () => {
    beforeEach(() => {
      mockVerifyCose.mockReset();
    });

    const makeIssueEvent = (): VCEventPayload => ({
      event: 'issue',
      issuerDid: ISSUER_DID,
      holderDid: HOLDER_DID,
      vcHash: VC_HASH,
      vcType: 'ContributionCredential',
      vcFormat: 'cose-sd',
      payloadSig: '{}',
      ts: '2025-01-01T00:00:00.000Z',
    });

    it('should accept issue event when anchor payload binding matches', async () => {
      const event = makeIssueEvent();
      const anchorPayload = buildExpectedIssueAnchor(event);
      mockVerifyCose.mockResolvedValue({
        valid: true,
        signerStakeAddress: ISSUER_STAKE,
        signedPayload: new TextEncoder().encode(JSON.stringify(anchorPayload)),
      });

      const result = await vcEventProcessor.verify!(event);
      expect(result.valid).toBe(true);
      expect(result.signerStakeAddress).toBe(ISSUER_STAKE);
    });

    it('should reject issue event when anchor payload does not match', async () => {
      const event = makeIssueEvent();
      mockVerifyCose.mockResolvedValue({
        valid: true,
        signerStakeAddress: ISSUER_STAKE,
        signedPayload: new TextEncoder().encode(JSON.stringify({
          event: 'issue',
          issuerDid: ISSUER_DID,
          holderDid: HOLDER_DID,
          vcHash: 'urn:uuid:wrong',
          vcType: 'ContributionCredential',
          vcFormat: 'cose-sd',
          ts: event.ts,
        })),
      });

      const result = await vcEventProcessor.verify!(event);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('payload_mismatch');
    });

    it('should accept legacy issue events with credential-shaped signed payload', async () => {
      const event = makeIssueEvent();
      mockVerifyCose.mockResolvedValue({
        valid: true,
        signerStakeAddress: ISSUER_STAKE,
        signedPayload: new TextEncoder().encode(JSON.stringify({
          iss: ISSUER_DID,
          sub: HOLDER_DID,
          jti: VC_HASH,
          vct: 'ContributionCredential',
          evidenceUrl: 'https://example.com/secret',
        })),
      });

      const result = await vcEventProcessor.verify!(event);
      expect(result.valid).toBe(true);
    });

    it('should reject issue event when signer is not issuer', async () => {
      const event = makeIssueEvent();
      mockVerifyCose.mockResolvedValue({
        valid: true,
        signerStakeAddress: 'stake_test1uz_attacker',
        signedPayload: new TextEncoder().encode(JSON.stringify(buildExpectedIssueAnchor(event))),
      });

      const result = await vcEventProcessor.verify!(event);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('signer_not_issuer');
    });
  });
});
