// Re-export IndexerConfig types from shared types package
export type { IndexerConfig, EndpointConfig } from '@prisma-dids/types';

// App-layer extended config with processor bindings
import type { IndexerConfig } from '@prisma-dids/types';
import type { EventProcessor } from '../worker/types.js';

/** IndexerConfig + app-layer processor binding. Only used inside the indexer app. */
export interface ResolvedIndexerConfig extends IndexerConfig {
  processors: Record<number, EventProcessor>;
}
