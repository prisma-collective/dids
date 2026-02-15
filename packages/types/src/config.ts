// Network and provider configuration types

export type Network = 'Preprod' | 'Mainnet';

export interface NetworkConfig {
  network: Network;
  blockfrostApiKey: string;
}

// PinataConfig supports either API key/secret OR JWT authentication
export type PinataConfig =
  | { apiKey: string; apiSecret: string; jwt?: never }
  | { jwt: string; apiKey?: never; apiSecret?: never };

// --- Indexer Configuration (P1) ---

import type { ZodSchema } from 'zod';

export interface EndpointConfig {
  method: 'GET' | 'POST';
  path: string;
  /** Unique identifier used to look up the route handler */
  handlerId: string;
  description: string;
}

/**
 * Config-driven indexer architecture: same codebase deployed as
 * DID Indexer (INDEXER_CONFIG=did) or VC Indexer (INDEXER_CONFIG=vc).
 */
export interface IndexerConfig {
  /** Human-readable name, e.g. "DID Indexer" */
  name: string;
  /** Cardano metadata labels to index (e.g. [199674] for L_DID) */
  labels: number[];
  /** PostgreSQL table name for events */
  eventsTable: string;
  /** Zod schema per metadata label for validation */
  schemas: Record<number, ZodSchema>;
  /** API endpoints to register */
  endpoints: EndpointConfig[];
  /** Polling interval in milliseconds (default 30000) */
  pollIntervalMs?: number;
  /** Network: preprod or mainnet (one deployment per network) */
  network: 'preprod' | 'mainnet';
  /** Confirmation depth: blocks behind chain tip before event is confirmed.
   *  Default 112 (mainnet, per NeoPRISM standard), 10 for preprod. */
  confirmationDepth?: number;
}
