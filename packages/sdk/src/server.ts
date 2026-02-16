// Prisma DIDs SDK - Server-only exports (Next.js API routes, etc.)
// Lightweight entry point for VC verification without Lucid/builder dependencies.
// Use this in server-side code that only needs verifyPresentation().

// VC verification (Node.js only — requires CSL for COSE_Sign1)
export { verifyPresentation } from './core/vc-verify.js';

// Re-export types used by verification consumers
export type { VerificationResult } from './core/vc.js';
