import type { ResolvedIndexerConfig } from './types.js';
import { didIndexerConfig } from './did-indexer.js';
import { vcIndexerConfig } from './vc-indexer.js';
import { aljVcIndexerConfig } from './alj-vc-indexer.js';

const configs: Record<string, ResolvedIndexerConfig> = {
  did: didIndexerConfig,
  vc: vcIndexerConfig,
  'alj-vc-indexer': aljVcIndexerConfig,
};

/**
 * Validate config invariant (Audit Fix #16):
 * - Every label must have a processor
 * - Every processor must have a label
 * - Derive schemas from processors (single source of truth)
 */
function validateAndDeriveSchemas(config: ResolvedIndexerConfig): void {
  const processorLabels = Object.keys(config.processors).map(Number);
  const missingProcessors = config.labels.filter(l => !config.processors[l]);
  const orphanProcessors = processorLabels.filter(l => !config.labels.includes(l));

  if (missingProcessors.length > 0) {
    throw new Error(`Config invariant: labels missing processors: ${missingProcessors}`);
  }
  if (orphanProcessors.length > 0) {
    throw new Error(`Config invariant: processors without labels: ${orphanProcessors}`);
  }

  // Derive schemas from processors — processors are the single source of truth
  config.schemas = Object.fromEntries(
    Object.entries(config.processors).map(([label, proc]) => [Number(label), proc.schema])
  );
}

/**
 * Loads the indexer configuration based on the INDEXER_CONFIG env var.
 * Defaults to 'did' if not set.
 * Validates config invariant and derives schemas from processors.
 */
export function loadConfig(): ResolvedIndexerConfig {
  const configName = process.env.INDEXER_CONFIG || 'did';
  const config = configs[configName];

  if (!config) {
    const available = Object.keys(configs).join(', ');
    throw new Error(
      `Unknown INDEXER_CONFIG="${configName}". Available: ${available}`
    );
  }

  validateAndDeriveSchemas(config);

  console.log(`Loaded config: ${config.name} (labels: ${config.labels.join(', ')}, network: ${config.network})`);
  return config;
}
