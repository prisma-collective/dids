// Prisma DIDs SDK
// Core SDK for creating and managing DIDs on Cardano

export const SDK_VERSION = '0.1.0';

// Core modules (browser-compatible)
export * from './core/did.js';
export * from './core/payload.js';
export * from './core/signature.js';
export * from './core/ipfs.js';

// Utilities (browser-compatible)
export * from './utils/keys.js';
export * from './utils/constants.js';
export * from './utils/encoding.js';

// ============================================================================
// Node.js-only exports (require cardano-serialization-lib-nodejs)
// These should NOT be imported in browser/client components
// ============================================================================

// Verification (requires stake address derivation)
export * from './core/cose-verify.js';
export * from './core/verification.js';

// VC issuance, presentation (browser-compatible)
export * from './core/vc.js';

// VC verification (Node.js only — imports cose-verify → CSL)
export * from './core/vc-verify.js';

// VC anchoring (on-chain event submission) + revocation status
export * from './core/vc-anchor.js';

// Stake utilities
export * from './utils/stake.js';

// Providers (typically used in API routes)
export * from './providers/types.js';
export * from './providers/blockfrost.js';
export * from './providers/koios.js';

// Transaction building
export * from './tx/builder.js';
export * from './tx/metadata.js';
