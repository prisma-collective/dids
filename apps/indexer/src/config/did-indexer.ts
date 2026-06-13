import { L_DID } from '@prisma-events/dids-types';
import type { ResolvedIndexerConfig } from './types.js';
import { didEventProcessor } from '../worker/did-processor.js';

/**
 * DID Indexer configuration.
 * Scans Cardano metadata label 199674 (L_DID) for DID lifecycle events.
 * Processor is the single source of truth for schema (Audit Fix #16).
 */
export const didIndexerConfig: ResolvedIndexerConfig = {
  name: 'DID Indexer',
  labels: [L_DID],
  eventsTable: 'did_events',
  schemas: {}, // Derived from processors at startup by loadConfig()
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
  processors: {
    [L_DID]: didEventProcessor,
  },
};
