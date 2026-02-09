// Prisma DIDs SDK
// Core SDK for creating and managing DIDs on Cardano

export const SDK_VERSION = '0.1.0';

// Core modules (browser-compatible)
export * from './core/did';
export * from './core/payload';
export * from './core/signature';
export * from './core/ipfs';

// Utilities (browser-compatible)
export * from './utils/keys';
export * from './utils/constants';
export * from './utils/encoding';

// ============================================================================
// Node.js-only exports (require cardano-serialization-lib-nodejs)
// These should NOT be imported in browser/client components
// ============================================================================

// Verification (requires stake address derivation)
export * from './core/verification';

// Stake utilities
export * from './utils/stake';

// Providers (typically used in API routes)
export * from './providers/types';
export * from './providers/blockfrost';
export * from './providers/koios';

// Transaction building
export * from './tx/builder';
export * from './tx/metadata';
