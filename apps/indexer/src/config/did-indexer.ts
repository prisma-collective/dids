import { DIDEventSchema, L_DID } from '@prisma-dids/types';
import type { IndexerConfig } from './types.js';

/**
 * DID Indexer configuration.
 * Scans Cardano metadata label 199674 (L_DID) for DID lifecycle events.
 */
export const didIndexerConfig: IndexerConfig = {
  name: 'DID Indexer',
  labels: [L_DID],
  eventsTable: 'did_events',
  schemas: {
    [L_DID]: DIDEventSchema,
  },
  endpoints: [
    {
      method: 'GET',
      path: '/did/:did',
      handlerId: 'did:resolve',
      description: 'Resolve a DID to its current document and metadata',
    },
    {
      method: 'GET',
      path: '/did/:did/history',
      handlerId: 'did:history',
      description: 'Get the full event history for a DID',
    },
    {
      method: 'GET',
      path: '/1.0/identifiers/:did',
      handlerId: 'did:universal-resolver',
      description: 'W3C Universal Resolver endpoint',
    },
  ],
  network: (process.env.NETWORK as 'preprod' | 'mainnet') || 'preprod',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 30_000,
  confirmationDepth: Number(process.env.CONFIRMATION_DEPTH) || 10,
};
