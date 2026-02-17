import { describe, it, expect } from 'vitest';
import { reduceVCStatus, type VCEventRow } from './vc.js';

/**
 * 2D.4: Integration tests — VC status reducer.
 *
 * Tests the deterministic status reducer that implements the
 * core VC lifecycle business logic (§4.3.1):
 * - Canonical issuer from earliest issue event
 * - Authorized revocation (signer === canonical issuer's stake)
 * - Deterministic ordering (blockHeight, txIndex, txHash)
 */

// ─── Helpers ───

const ISSUER_DID = 'did:cardano:stake_test1uzissuer';
const ISSUER_STAKE = 'stake_test1uzissuer';
const HOLDER_DID = 'did:cardano:stake_test1uzholder';
const VC_HASH = 'urn:uuid:12345678-1234-1234-1234-123456789012';

function makeRow(overrides: Partial<VCEventRow>): VCEventRow {
  return {
    id: crypto.randomUUID(),
    txHash: `tx_${Math.random().toString(36).slice(2)}`,
    txIndex: 0,
    event: 'issue',
    issuerDid: ISSUER_DID,
    holderDid: HOLDER_DID,
    validatorDid: null,
    signerStakeAddress: ISSUER_STAKE,
    vcHash: VC_HASH,
    vcType: 'ContributionCredential',
    vcFormat: 'cose-sd',
    reason: null,
    ipfsCid: null,
    valid: true,
    validationError: null,
    confirmed: true,
    confirmedAtHeight: 1000,
    blockHeight: 1000,
    timestamp: new Date('2025-01-01T00:00:00Z'),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('reduceVCStatus', () => {
  // ─── Basic states ───

  it('should return "unknown" for empty events', () => {
    const status = reduceVCStatus([]);
    expect(status.status).toBe('unknown');
  });

  it('should return "active" for a single issue event', () => {
    const events = [makeRow({ event: 'issue' })];
    const status = reduceVCStatus(events);

    expect(status.status).toBe('active');
    expect(status.vcHash).toBe(VC_HASH);
    expect(status.issuer).toBe(ISSUER_DID);
    expect(status.holder).toBe(HOLDER_DID);
    expect(status.vcType).toBe('ContributionCredential');
    expect(status.confirmed).toBe(true);
  });

  it('should return "unknown" if only validate/revoke events exist (no issue)', () => {
    const events = [
      makeRow({ event: 'validate', blockHeight: 1000 }),
      makeRow({ event: 'revoke', blockHeight: 1001 }),
    ];
    const status = reduceVCStatus(events);
    expect(status.status).toBe('unknown');
  });

  // ─── Revocation ───

  it('should return "revoked" for authorized revocation (signer = canonical issuer)', () => {
    const events = [
      makeRow({
        event: 'issue',
        blockHeight: 1000,
        txHash: 'tx_issue',
        timestamp: new Date('2025-01-01T00:00:00Z'),
      }),
      makeRow({
        event: 'revoke',
        blockHeight: 1005,
        txHash: 'tx_revoke',
        signerStakeAddress: ISSUER_STAKE, // same as issuer
        reason: 'credential expired',
        timestamp: new Date('2025-01-02T00:00:00Z'),
      }),
    ];

    const status = reduceVCStatus(events);

    expect(status.status).toBe('revoked');
    expect(status.revokedTxHash).toBe('tx_revoke');
    expect(status.reason).toBe('credential expired');
    expect(status.issuedTxHash).toBe('tx_issue');
  });

  it('should ignore unauthorized revocation (signer != canonical issuer)', () => {
    const events = [
      makeRow({
        event: 'issue',
        blockHeight: 1000,
        txHash: 'tx_issue',
      }),
      makeRow({
        event: 'revoke',
        blockHeight: 1005,
        txHash: 'tx_revoke',
        signerStakeAddress: 'stake_test1uz_attacker', // different from issuer
      }),
    ];

    const status = reduceVCStatus(events);

    expect(status.status).toBe('active'); // revoke ignored
    expect(status.revokedTxHash).toBeUndefined();
  });

  it('should remain "active" when revoke signer is null (no match)', () => {
    // Edge case: if signerStakeAddress is null, it should NOT match
    const events = [
      makeRow({
        event: 'issue',
        blockHeight: 1000,
      }),
      makeRow({
        event: 'revoke',
        blockHeight: 1005,
        signerStakeAddress: null, // null signer
      }),
    ];

    const status = reduceVCStatus(events);
    expect(status.status).toBe('active'); // null !== 'stake_test1uzissuer'
  });

  // ─── Ordering ───

  it('should use deterministic ordering: blockHeight ASC, txIndex ASC, txHash ASC', () => {
    // Events arrive out of order — reducer sorts them
    const events = [
      makeRow({
        event: 'revoke',
        blockHeight: 1005,
        txHash: 'tx_b',
        signerStakeAddress: ISSUER_STAKE,
      }),
      makeRow({
        event: 'issue',
        blockHeight: 1000,
        txHash: 'tx_a',
      }),
    ];

    const status = reduceVCStatus(events);
    expect(status.status).toBe('revoked');
    expect(status.issuedTxHash).toBe('tx_a');
  });

  it('should use txIndex as tiebreaker within same block', () => {
    // Two issue events in same block — lower txIndex wins canonical issuer
    const events = [
      makeRow({
        event: 'issue',
        blockHeight: 1000,
        txIndex: 5,
        txHash: 'tx_second',
        issuerDid: 'did:cardano:stake_test1uz_second',
      }),
      makeRow({
        event: 'issue',
        blockHeight: 1000,
        txIndex: 2,
        txHash: 'tx_first',
        issuerDid: ISSUER_DID,
      }),
    ];

    const status = reduceVCStatus(events);
    expect(status.issuer).toBe(ISSUER_DID); // txIndex 2 < 5
  });

  it('should treat null txIndex as NULLS LAST', () => {
    const events = [
      makeRow({
        event: 'issue',
        blockHeight: 1000,
        txIndex: null, // should sort last
        txHash: 'tx_null_idx',
        issuerDid: 'did:cardano:stake_test1uz_null',
      }),
      makeRow({
        event: 'issue',
        blockHeight: 1000,
        txIndex: 0,
        txHash: 'tx_idx_zero',
        issuerDid: ISSUER_DID,
      }),
    ];

    const status = reduceVCStatus(events);
    expect(status.issuer).toBe(ISSUER_DID); // txIndex 0 < null
  });

  it('should use txHash as final tiebreaker', () => {
    const events = [
      makeRow({
        event: 'issue',
        blockHeight: 1000,
        txIndex: 0,
        txHash: 'tx_zzz',
        issuerDid: 'did:cardano:stake_test1uz_zzz',
      }),
      makeRow({
        event: 'issue',
        blockHeight: 1000,
        txIndex: 0,
        txHash: 'tx_aaa',
        issuerDid: ISSUER_DID,
      }),
    ];

    const status = reduceVCStatus(events);
    expect(status.issuer).toBe(ISSUER_DID); // 'tx_aaa' < 'tx_zzz'
  });

  // ─── Confirmation ───

  it('should report confirmed=false if issue event is unconfirmed', () => {
    const events = [makeRow({ event: 'issue', confirmed: false })];
    const status = reduceVCStatus(events);
    expect(status.confirmed).toBe(false);
  });

  it('should report confirmed=false if revoke event is unconfirmed even if issue is confirmed', () => {
    const events = [
      makeRow({
        event: 'issue',
        blockHeight: 1000,
        confirmed: true,
      }),
      makeRow({
        event: 'revoke',
        blockHeight: 1005,
        confirmed: false,
        signerStakeAddress: ISSUER_STAKE,
      }),
    ];

    const status = reduceVCStatus(events);
    expect(status.status).toBe('revoked');
    expect(status.confirmed).toBe(false); // issue && revoke must both be confirmed
  });

  // ─── Validate events ───

  it('should ignore validate events for status determination', () => {
    const events = [
      makeRow({ event: 'issue', blockHeight: 1000 }),
      makeRow({ event: 'validate', blockHeight: 1002, validatorDid: 'did:cardano:stake_test1uzvalidator' }),
    ];

    const status = reduceVCStatus(events);
    expect(status.status).toBe('active'); // validate doesn't affect status
  });

  // ─── Complex scenario ───

  it('should handle issue → validate → unauthorized revoke → authorized revoke', () => {
    const events = [
      makeRow({
        event: 'issue',
        blockHeight: 1000,
        txHash: 'tx_issue',
      }),
      makeRow({
        event: 'validate',
        blockHeight: 1002,
        txHash: 'tx_validate',
        validatorDid: 'did:cardano:stake_test1uzvalidator',
      }),
      makeRow({
        event: 'revoke',
        blockHeight: 1003,
        txHash: 'tx_bad_revoke',
        signerStakeAddress: 'stake_test1uz_attacker',
      }),
      makeRow({
        event: 'revoke',
        blockHeight: 1005,
        txHash: 'tx_good_revoke',
        signerStakeAddress: ISSUER_STAKE,
        reason: 'superseded',
      }),
    ];

    const status = reduceVCStatus(events);
    expect(status.status).toBe('revoked');
    expect(status.revokedTxHash).toBe('tx_good_revoke'); // first authorized revoke
    expect(status.reason).toBe('superseded');
  });
});
