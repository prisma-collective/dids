import { L_VC } from '@prisma-events/dids-schemas';
import type { ResolvedIndexerConfig } from './types.js';
import { vcEventProcessor } from '../worker/vc-processor.js';

/**
 * VC Indexer configuration.
 * Scans Cardano metadata label 199675 (L_VC) for VC lifecycle events.
 * Organizations fork and deploy their own instance with this config.
 * Processor is the single source of truth for schema (Audit Fix #16).
 */
export const vcIndexerConfig: ResolvedIndexerConfig = {
  name: 'VC Indexer',
  labels: [L_VC],
  eventsTable: 'vc_events',
  schemas: {}, // Derived from processors at startup by loadConfig()
  endpoints: [
    {
      method: 'GET',
      path: '/vc/:vcHash',
      handlerId: 'vc:resolve',
      description: 'All anchor events for a credential',
    },
    {
      method: 'GET',
      path: '/vc/:vcHash/status',
      handlerId: 'vc:status',
      description: 'Current VC status (active/revoked/unknown)',
    },
    {
      method: 'GET',
      path: '/issuer/:did/credentials',
      handlerId: 'vc:issuer-list',
      description: 'Paginated VCs issued by a DID',
    },
    {
      method: 'GET',
      path: '/holder/:did/credentials',
      handlerId: 'vc:holder-list',
      description: 'Paginated VCs held by a DID',
    },
    {
      method: 'GET',
      path: '/schemas',
      handlerId: 'vc:schemas',
      description: 'Supported credential schemas from registry',
    },
  ],
  network: (process.env.NETWORK as 'preprod' | 'mainnet') || 'preprod',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 30_000,
  confirmationDepth: Number(process.env.CONFIRMATION_DEPTH) || 10,
  processors: {
    [L_VC]: vcEventProcessor,
  },
};
