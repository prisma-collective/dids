// Prisma DIDs SDK - Browser-safe exports
// Use this entry point for client-side code (React components, etc.)
// These modules do NOT import cardano-serialization-lib

export const SDK_VERSION = '0.1.0';

// Core modules (browser-compatible)
export * from './core/did.js';
export * from './core/payload.js';
export * from './core/signature.js';
export * from './core/ipfs.js';

// Transaction metadata (browser-compatible)
export * from './tx/metadata.js';

// Utilities (browser-compatible)
export * from './utils/keys.js';
export * from './utils/constants.js';
export * from './utils/encoding.js';

// Note: For verification, stake utilities, and providers, use the main SDK
// import in Node.js environments (API routes, server components).
