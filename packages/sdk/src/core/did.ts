import type { DIDDocument } from '@prisma-dids/types';
import { hexToPublicKeyMultibase } from '../utils/keys';

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
 * Converts hex public key from wallet to multibase format automatically
 */
export function generateDIDDocument(params: {
  did: string;
  publicKeyHex: string;  // Ed25519 hex key from CIP-30 wallet
  serviceEndpoint?: string;
}): DIDDocument {
  // Convert hex key to multibase (z6Mk... format)
  const publicKeyMultibase = hexToPublicKeyMultibase(params.publicKeyHex);

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
    service: params.serviceEndpoint ? [
      {
        id: `${params.did}#prisma-api`,
        type: 'PrismaContributionService',
        serviceEndpoint: params.serviceEndpoint
      }
    ] : []
  };
}
