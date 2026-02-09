/**
 * Crypto setup for @noble/ed25519 v3.0
 *
 * This module re-exports @noble/ed25519 for use throughout the SDK.
 *
 * IMPORTANT: We use ASYNC methods exclusively (verifyAsync, signAsync, getPublicKeyAsync)
 * which use WebCrypto's built-in SHA-512 implementation. These methods work in both
 * Node.js and browsers without any manual hash configuration.
 *
 * If you need SYNC methods (verify, sign, getPublicKey), you must configure hashes.sha512:
 * ```typescript
 * import { sha512 } from '@noble/hashes/sha2.js';
 * import { ed25519 } from './crypto-setup';
 * ed25519.hashes.sha512 = sha512;
 * ```
 */
export * as ed25519 from '@noble/ed25519';
