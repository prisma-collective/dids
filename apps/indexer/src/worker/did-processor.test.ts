import { describe, it, expect } from 'vitest';
import { didEventProcessor } from './did-processor.js';
import { DIDEventSchema } from '@prisma-events/dids-types';
import type { MetadataEvent } from '../sources/types.js';
import type { ProcessedResult } from './types.js';

/**
 * D.1: Unit tests — DID processor makeRow + schema validation.
 *
 * Tests that:
 * - DIDEventSchema validates correct events and rejects invalid ones
 * - makeRow maps raw metadata events to did_events table rows
 *
 * Pattern follows vc-processor.test.ts exactly.
 */

// ─── Helpers ───

const TEST_DID = 'did:cardano:stake_test1uzcontroller';
const CONTROLLER_STAKE = 'stake_test1uzcontroller';

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

function makeDIDEventPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: TEST_DID,
    ipfs: 'QmTestCID123abc',
    action: 'create',
    v: 1,
    prev: null,
    payloadSig: JSON.stringify({ sig: 'aa', key: 'bb', address: 'cc' }),
    ts: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('did-processor', () => {
  // ─── Schema validation ───

  describe('DIDEventSchema', () => {
    it('should validate a correct create event', () => {
      const payload = makeDIDEventPayload();
      const result = DIDEventSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate a correct update event', () => {
      const payload = makeDIDEventPayload({
        action: 'update',
        v: 2,
        prev: 'tx_prev_hash',
      });
      const result = DIDEventSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate a correct revoke event', () => {
      const payload = makeDIDEventPayload({
        action: 'revoke',
        v: 3,
        prev: 'tx_prev_hash',
      });
      const result = DIDEventSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject event with missing required fields', () => {
      const payload = { action: 'create' }; // missing everything else
      const result = DIDEventSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject unknown action type', () => {
      const payload = makeDIDEventPayload({ action: 'delete' });
      const result = DIDEventSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject id not starting with did:cardano:stake', () => {
      const payload = makeDIDEventPayload({ id: 'did:web:example.com' });
      const result = DIDEventSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject ipfs not starting with Qm', () => {
      const payload = makeDIDEventPayload({ ipfs: 'bafy123invalid' });
      const result = DIDEventSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // ─── makeRow ───

  describe('makeRow', () => {
    it('should map create event fields to did_events row', () => {
      const raw = makeRawEvent();
      const reconstructed = makeDIDEventPayload();
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: CONTROLLER_STAKE },
      };

      const row = didEventProcessor.makeRow(raw, reconstructed, processedResult);

      expect(row.did).toBe(TEST_DID);
      expect(row.txHash).toBe('tx_abc123');
      expect(row.action).toBe('create');
      expect(row.version).toBe(1);
      expect(row.prevTxHash).toBeNull();
      expect(row.ipfsCid).toBe('QmTestCID123abc');
      expect(row.valid).toBe(true);
      expect(row.confirmed).toBe(false);
      expect(row.blockHeight).toBe(5000);
    });

    it('should map update event with prevTxHash', () => {
      const raw = makeRawEvent();
      const reconstructed = makeDIDEventPayload({
        action: 'update',
        v: 2,
        prev: 'tx_prev_hash',
      });
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: CONTROLLER_STAKE },
      };

      const row = didEventProcessor.makeRow(raw, reconstructed, processedResult);

      expect(row.action).toBe('update');
      expect(row.version).toBe(2);
      expect(row.prevTxHash).toBe('tx_prev_hash');
    });

    it('should map revoke event', () => {
      const raw = makeRawEvent();
      const reconstructed = makeDIDEventPayload({
        action: 'revoke',
        v: 3,
        prev: 'tx_update_hash',
      });
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: CONTROLLER_STAKE },
      };

      const row = didEventProcessor.makeRow(raw, reconstructed, processedResult);

      expect(row.action).toBe('revoke');
      expect(row.version).toBe(3);
      expect(row.prevTxHash).toBe('tx_update_hash');
    });

    it('should handle null ipfs', () => {
      const raw = makeRawEvent();
      const reconstructed = makeDIDEventPayload({ ipfs: null });
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: CONTROLLER_STAKE },
      };

      const row = didEventProcessor.makeRow(raw, reconstructed, processedResult);
      expect(row.ipfsCid).toBeNull();
    });

    it('should set confirmed to false for all new rows', () => {
      const raw = makeRawEvent();
      const reconstructed = makeDIDEventPayload();
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: CONTROLLER_STAKE },
      };

      const row = didEventProcessor.makeRow(raw, reconstructed, processedResult);
      expect(row.confirmed).toBe(false);
    });

    it('should mark row as invalid when verification fails', () => {
      const raw = makeRawEvent();
      const reconstructed = makeDIDEventPayload();
      const processedResult: ProcessedResult = {
        valid: false,
        validationError: 'signer_not_controller',
        verifyResult: { valid: false, signerStakeAddress: 'stake_test1uz_wrong' },
      };

      const row = didEventProcessor.makeRow(raw, reconstructed, processedResult);

      expect(row.valid).toBe(false);
      expect(row.validationError).toBe('signer_not_controller');
    });

    it('should convert blockTime to timestamp Date', () => {
      const blockTime = 1704067200; // 2024-01-01T00:00:00Z
      const raw = makeRawEvent({ blockTime });
      const reconstructed = makeDIDEventPayload();
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: CONTROLLER_STAKE },
      };

      const row = didEventProcessor.makeRow(raw, reconstructed, processedResult);
      expect(row.timestamp).toEqual(new Date(blockTime * 1000));
    });

    it('should store raw metadata as JSON string', () => {
      const raw = makeRawEvent({ jsonMetadata: { action: 'create', data: 'test' } });
      const reconstructed = makeDIDEventPayload();
      const processedResult: ProcessedResult = {
        valid: true,
        validationError: null,
        verifyResult: { valid: true, signerStakeAddress: CONTROLLER_STAKE },
      };

      const row = didEventProcessor.makeRow(raw, reconstructed, processedResult);
      expect(JSON.parse(row.rawEvent as string)).toEqual({ action: 'create', data: 'test' });
    });
  });

  // ─── Processor table reference ───

  it('should reference the didEvents table', () => {
    expect(didEventProcessor.table).toBeDefined();
  });

  it('should use DIDEventSchema', () => {
    expect(didEventProcessor.schema).toBe(DIDEventSchema);
  });
});
