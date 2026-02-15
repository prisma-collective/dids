import { describe, it, expect } from 'vitest';
import { buildCreatePayload, buildUpdatePayload, buildRevokePayload } from './payload.js';

describe('payload', () => {
  describe('buildCreatePayload', () => {
    it('should build valid create payload', () => {
      const params = {
        did: 'did:cardano:stake_test1test',
        ipfsCid: 'QmTest123',
      };

      const payload = buildCreatePayload(params);

      expect(payload.id).toBe(params.did);
      expect(payload.ipfs).toBe(params.ipfsCid);
      expect(payload.action).toBe('create');
      expect(payload.v).toBe(1);
      expect(payload.prev).toBeNull();
    });

    it('should always start at version 1', () => {
      const payload = buildCreatePayload({
        did: 'did:cardano:stake_test1test',
        ipfsCid: 'QmTest123',
      });

      expect(payload.v).toBe(1);
    });
  });

  describe('buildUpdatePayload', () => {
    it('should build valid update payload', () => {
      const params = {
        did: 'did:cardano:stake_test1test',
        ipfsCid: 'QmTest456',
        prevTxHash: 'txhash123',
        version: 2,
      };

      const payload = buildUpdatePayload(params);

      expect(payload.id).toBe(params.did);
      expect(payload.ipfs).toBe(params.ipfsCid);
      expect(payload.action).toBe('update');
      expect(payload.v).toBe(2);
      expect(payload.prev).toBe('txhash123');
    });

    it('should increment version correctly', () => {
      const payload = buildUpdatePayload({
        did: 'did:cardano:stake_test1test',
        ipfsCid: 'QmTest',
        prevTxHash: 'tx1',
        version: 5,
      });

      expect(payload.v).toBe(5);
    });
  });

  describe('buildRevokePayload', () => {
    it('should build valid revoke payload', () => {
      const params = {
        did: 'did:cardano:stake_test1test',
        ipfsCid: 'QmRevoked789',
        prevTxHash: 'txhash456',
        version: 3,
      };

      const payload = buildRevokePayload(params);

      expect(payload.id).toBe(params.did);
      expect(payload.ipfs).toBe(params.ipfsCid);
      expect(payload.action).toBe('revoke');
      expect(payload.v).toBe(3);
      expect(payload.prev).toBe('txhash456');
    });
  });

  describe('payload structure', () => {
    it('should produce JSON-serializable payloads', () => {
      const createPayload = buildCreatePayload({
        did: 'did:cardano:stake_test1test',
        ipfsCid: 'QmTest',
      });

      const json = JSON.stringify(createPayload);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(createPayload);
    });
  });
});
