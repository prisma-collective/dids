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

// SD-JWT utilities (browser-compatible)
export * from './core/sd-jwt.js';

// VC issuance + presentation (browser-compatible — uses wallet.signData)
// Note: verifyPresentation() is in vc-verify.ts (Node.js-only, NOT exported here)
export * from './core/vc.js';

// VC anchor types (browser-safe — no Lucid dependency)
// Note: anchorVCIssuance/Validation/Revocation and CardanoVCAnchorProvider
// use Lucid and are only available from the main SDK entrypoint.
export type {
  AnchorIssuanceParams,
  AnchorValidationParams,
  AnchorRevocationParams,
  AnchorResult,
  VCStatusResult,
  VCAnchorProvider,
} from './core/vc-anchor.js';

// Note: For verification, stake utilities, providers, and VC anchoring
// functions, use the main SDK import in Node.js environments.
