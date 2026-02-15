import type { IndexerConfig } from './types.js';
import { didIndexerConfig } from './did-indexer.js';

const configs: Record<string, IndexerConfig> = {
  did: didIndexerConfig,
  // vc: vcIndexerConfig — added in P2b
};

/**
 * Loads the indexer configuration based on the INDEXER_CONFIG env var.
 * Defaults to 'did' if not set.
 */
export function loadConfig(): IndexerConfig {
  const configName = process.env.INDEXER_CONFIG || 'did';
  const config = configs[configName];

  if (!config) {
    const available = Object.keys(configs).join(', ');
    throw new Error(
      `Unknown INDEXER_CONFIG="${configName}". Available: ${available}`
    );
  }

  console.log(`Loaded config: ${config.name} (labels: ${config.labels.join(', ')}, network: ${config.network})`);
  return config;
}
