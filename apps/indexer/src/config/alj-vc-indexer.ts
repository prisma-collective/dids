/**
 * ALJ (Action Learning Journey) VC Indexer configuration.
 *
 * Example fork config: same structure as vc-indexer.ts, customized
 * for the ALJ pilot deployment. To use:
 *   INDEXER_CONFIG=alj-vc-indexer
 *
 * ALJ can add custom credential types by extending the schemas package
 * and registering additional processors here.
 */
import { L_VC } from '@prisma-events/dids-schemas';
import type { ResolvedIndexerConfig } from './types.js';
import { vcEventProcessor } from '../worker/vc-processor.js';

export const aljVcIndexerConfig: ResolvedIndexerConfig = {
  name: 'ALJ VC Indexer',
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
