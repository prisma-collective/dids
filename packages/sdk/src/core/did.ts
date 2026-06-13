import type { DIDDocument, Service } from '@prisma-events/dids-types';
import { hexToPublicKeyMultibase } from '../utils/keys.js';

/**
 * Derives DID from stake address per §2.1.1
 */
export function deriveDID(stakeAddress: string): string {
  if (!stakeAddress.startsWith('stake1') && !stakeAddress.startsWith('stake_test1')) {
    throw new Error('Invalid stake address format');
  }
  return `did:cardano:${stakeAddress}`;
}

/**
 * Generates W3C-compliant DID Document per §2.2
 * Converts hex public key from wallet to multibase format automatically.
 *
 * @param params.services - Explicit service array (takes precedence over serviceEndpoint)
 * @param params.serviceEndpoint - Legacy shorthand: adds a single PrismaContributionService
 * @param params.vcIndexerEndpoint - If set, adds a VCIndexer service entry for verifier discovery
 */
export function generateDIDDocument(params: {
  did: string;
  publicKeyHex: string;
  serviceEndpoint?: string;
  vcIndexerEndpoint?: string;
  services?: Service[];
}): DIDDocument {
  const publicKeyMultibase = hexToPublicKeyMultibase(params.publicKeyHex);

  // Build services: explicit array wins; otherwise build from shorthand params
  let services: Service[];
  if (params.services) {
    services = params.services;
  } else {
    services = [];
    if (params.serviceEndpoint) {
      services.push({
        id: `${params.did}#prisma-api`,
        type: 'PrismaContributionService',
        serviceEndpoint: params.serviceEndpoint,
      });
    }
    if (params.vcIndexerEndpoint) {
      services.push({
        id: `${params.did}#vc-indexer`,
        type: 'VCIndexer',
        serviceEndpoint: params.vcIndexerEndpoint,
      });
    }
  }

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ],
    id: params.did,
    verificationMethod: [
      {
        id: `${params.did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: params.did,
        publicKeyMultibase
      }
    ],
    authentication: [`${params.did}#key-1`],
    service: services,
  };
}
