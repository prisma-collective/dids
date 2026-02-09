// Prisma DIDs SDK - Browser-safe exports
// Use this entry point for client-side code (React components, etc.)
// These modules do NOT import cardano-serialization-lib

export const SDK_VERSION = '0.1.0';

// Core modules (browser-compatible)
export * from './core/did';
export * from './core/payload';
export * from './core/signature';
export * from './core/ipfs';

// Transaction metadata (browser-compatible)
export * from './tx/metadata';

// Utilities (browser-compatible)
export * from './utils/keys';
export * from './utils/constants';
export * from './utils/encoding';

// Note: For verification, stake utilities, and providers, use the main SDK
// import in Node.js environments (API routes, server components).
