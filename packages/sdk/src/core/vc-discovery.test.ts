import { describe, it, expect } from 'vitest';
import { generateDIDDocument } from './did.js';

/**
 * 2D.6: Verifier discovery test
 *
 * Verifies that a DID Document with a VCIndexer service endpoint
 * can be resolved to extract the VC Indexer URL for status queries.
 */
describe('verifier discovery (2D.6)', () => {
  const DID = 'did:cardano:stake_test1uztest_issuer';
  const PUBLIC_KEY_HEX = '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29';
  const VC_INDEXER_URL = 'https://vc-indexer.alj.example.com';

  it('should create DID Document with VCIndexer service endpoint', () => {
    const doc = generateDIDDocument({
      did: DID,
      publicKeyHex: PUBLIC_KEY_HEX,
      vcIndexerEndpoint: VC_INDEXER_URL,
    });

    const vcService = doc.service?.find(s => s.type === 'VCIndexer');
    expect(vcService).toBeDefined();
    expect(vcService!.serviceEndpoint).toBe(VC_INDEXER_URL);
    expect(vcService!.id).toBe(`${DID}#vc-indexer`);
  });

  it('should resolve VCIndexer endpoint from DID Document', () => {
    const doc = generateDIDDocument({
      did: DID,
      publicKeyHex: PUBLIC_KEY_HEX,
      serviceEndpoint: 'https://api.example.com',
      vcIndexerEndpoint: VC_INDEXER_URL,
    });

    // Simulates what a verifier would do: resolve DID → extract VCIndexer endpoint
    const vcIndexerService = doc.service?.find(s => s.type === 'VCIndexer');
    expect(vcIndexerService).toBeDefined();

    // Construct status query URL from discovered endpoint
    const vcHash = 'urn:uuid:12345678-1234-1234-1234-123456789012';
    const statusUrl = `${vcIndexerService!.serviceEndpoint}/vc/${encodeURIComponent(vcHash)}/status`;

    expect(statusUrl).toBe(
      `${VC_INDEXER_URL}/vc/${encodeURIComponent(vcHash)}/status`
    );
  });

  it('should distinguish VCIndexer from other service types', () => {
    const doc = generateDIDDocument({
      did: DID,
      publicKeyHex: PUBLIC_KEY_HEX,
      serviceEndpoint: 'https://api.example.com',
      vcIndexerEndpoint: VC_INDEXER_URL,
    });

    expect(doc.service).toHaveLength(2);

    const prismaService = doc.service?.find(s => s.type === 'PrismaContributionService');
    const vcService = doc.service?.find(s => s.type === 'VCIndexer');

    expect(prismaService!.serviceEndpoint).toBe('https://api.example.com');
    expect(vcService!.serviceEndpoint).toBe(VC_INDEXER_URL);
  });

  it('should return no VCIndexer when not configured', () => {
    const doc = generateDIDDocument({
      did: DID,
      publicKeyHex: PUBLIC_KEY_HEX,
    });

    const vcService = doc.service?.find(s => s.type === 'VCIndexer');
    expect(vcService).toBeUndefined();
  });
});
