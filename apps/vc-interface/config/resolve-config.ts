/**
 * Runtime config resolver — merges env vars with org-config defaults.
 * Env vars take precedence, enabling deployment-time overrides
 * without modifying org-config.ts (preserves forkability).
 */
import { defaultConfig, type VCInterfaceConfig } from './org-config';

export function resolveConfig(): VCInterfaceConfig {
  return {
    ...defaultConfig,
    INDEXER_ENDPOINT:
      process.env.NEXT_PUBLIC_VC_INDEXER_ENDPOINT || defaultConfig.INDEXER_ENDPOINT,
    DID_INDEXER_ENDPOINT:
      process.env.NEXT_PUBLIC_DID_INDEXER_ENDPOINT || defaultConfig.DID_INDEXER_ENDPOINT,
    NETWORK:
      (process.env.NEXT_PUBLIC_NETWORK as 'preprod' | 'mainnet') || defaultConfig.NETWORK,
  };
}

/** Resolved config singleton (safe to use in both server and client code) */
export const config = resolveConfig();
