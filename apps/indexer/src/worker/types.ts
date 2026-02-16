import type { PgTable } from 'drizzle-orm/pg-core';
import type { ZodSchema } from 'zod';
import type { Database } from '../db/connection.js';
import type { MetadataEvent } from '../sources/types.js';

/** Structured output from verify() — carries signer context (Audit Fix #22) */
export interface VerifyResult {
  valid: boolean;
  /** Stake address derived from payloadSig.address during COSE verification.
   *  Stored in the row for query-time authorization checks (e.g., revoke reducer). */
  signerStakeAddress?: string;
  error?: string;
}

/** Final decision passed to makeRow() — merges verify + validateChain outcomes (Audit Fix #25).
 *  processEvents() builds this; makeRow() just reads it. */
export interface ProcessedResult {
  /** Final validity: false if verify OR validateChain failed */
  valid: boolean;
  /** Combined error from verify or validateChain (null if valid) */
  validationError: string | null;
  /** Signer context from verify() — always present even if valid=false,
   *  so makeRow() can store signerStakeAddress for query-time checks */
  verifyResult: VerifyResult;
}

export interface EventProcessor {
  /** Drizzle table reference for this event type */
  table: PgTable;
  /** Zod schema for raw metadata validation */
  schema: ZodSchema;
  /** Verify event signature + authorization. Returns structured result (Audit Fix #22). */
  verify(event: unknown): Promise<VerifyResult>;
  /** Domain-specific chain validation (DID needs prev-linkage; VC does not) */
  validateChain?(db: Database, event: unknown, txHash: string): Promise<{ valid: boolean; error?: string }>;
  /** Map raw metadata + MetadataEvent + processed result to a table row (Audit Fix #22, #25).
   *  processedResult carries final valid/validationError (from verify + validateChain)
   *  and verifyResult.signerStakeAddress for domain-specific columns. */
  makeRow(raw: MetadataEvent, reconstructed: unknown, processedResult: ProcessedResult): Record<string, unknown>;
}

export interface ProcessResult {
  processed: number;
  valid: number;
  invalid: number;
  skipped: number; // dedup conflicts
}
