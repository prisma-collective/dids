import { describe, it, expect } from 'vitest';
import { deriveDID, generateDIDDocument } from './did';

describe('did', () => {
  describe('deriveDID', () => {
    it('should derive DID from preprod stake address', () => {
      const stakeAddress = 'stake_test1uz9u4cd2ggdh0f5drltjw3v5j5p6qlw7wd0fqzxqkxgf7nc3aq8j7';
      const did = deriveDID(stakeAddress);

      expect(did).toBe('did:cardano:stake_test1uz9u4cd2ggdh0f5drltjw3v5j5p6qlw7wd0fqzxqkxgf7nc3aq8j7');
    });

    it('should derive DID from mainnet stake address', () => {
      const stakeAddress = 'stake1u9ylzsgxaa6xctf4juup682ar3juj85n8tx3hthnljg47zqgm5wse';
      const did = deriveDID(stakeAddress);

      expect(did).toBe('did:cardano:stake1u9ylzsgxaa6xctf4juup682ar3juj85n8tx3hthnljg47zqgm5wse');
    });

    it('should throw error for invalid stake address', () => {
      const invalidAddress = 'addr1_invalid';

      expect(() => deriveDID(invalidAddress))
        .toThrow('Invalid stake address format');
    });
  });

  describe('generateDIDDocument', () => {
    it('should generate W3C-compliant DID document', () => {
      const params = {
        did: 'did:cardano:stake_test1test',
        publicKeyHex: '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29',
      };

      const doc = generateDIDDocument(params);

      expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1');
      expect(doc.id).toBe(params.did);
      expect(doc.verificationMethod).toHaveLength(1);
      const vm = doc.verificationMethod[0];
      expect(vm).toBeDefined();
      expect(vm!.type).toBe('Ed25519VerificationKey2020');
      expect(vm!.publicKeyMultibase).toMatch(/^z6Mk/);
      expect(doc.authentication).toEqual([`${params.did}#key-1`]);
    });

    it('should include service endpoint when provided', () => {
      const params = {
        did: 'did:cardano:stake_test1test',
        publicKeyHex: '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29',
        serviceEndpoint: 'https://example.com/api',
      };

      const doc = generateDIDDocument(params);

      expect(doc.service).toHaveLength(1);
      const svc = doc.service?.[0];
      expect(svc).toBeDefined();
      expect(svc!.serviceEndpoint).toBe('https://example.com/api');
      expect(svc!.type).toBe('PrismaContributionService');
    });

    it('should have empty service array when no endpoint provided', () => {
      const params = {
        did: 'did:cardano:stake_test1test',
        publicKeyHex: '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29',
      };

      const doc = generateDIDDocument(params);

      expect(doc.service).toEqual([]);
    });
  });
});
