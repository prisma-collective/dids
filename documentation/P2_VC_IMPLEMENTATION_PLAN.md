# P2: Verifiable Credentials Implementation Plan

**Status:** v8 — Approved for Implementation
**Date:** 2026-02-15
**Scope:** P2a (SDK VC & Anchoring) + P2b (VC Integration & VC Indexer Config)
**Reference:** [TECHNICAL_DESIGN.md §7-§8](./TECHNICAL_DESIGN.md) · [POC_PLAN.md lines 241-300](./POC_PLAN.md)

---

## Audit Fixes Applied

### v2 Fixes

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | **P0** | JWT signing incompatible with CIP-30 | COSE-SD model: SD-JWT disclosure mechanism + COSE_Sign1 signing (no private key access needed) |
| 2 | **P0** | VC event schema missing signer field | Added `payloadSig` to `VCEventPayloadSchema`, mirrors DID pattern exactly |
| 3 | **P1** | Processor hardcoded to `did_events` | Added Phase 0 step: processor registry by config (table + verify fn + row mapper), poller also refactored |
| 4 | **P1** | Env var mismatch (`BLOCKFROST_PROJECT_ID` vs `BLOCKFROST_API_KEY`) | Standardized on `BLOCKFROST_API_KEY` (matches live indexer `index.ts:20`) |
| 5 | **P2** | org-config "unchanged" vs env-driven conflict | org-config.ts stays as fork-time defaults; app bootstrap layer merges env overrides via `createConfig()` |
| 6 | **P2** | Claim enum drift between plan and UI types | Single source of truth in `packages/schemas`; UI types re-export from schemas |

### v3 Fixes

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 7 | **P0** | `payloadSig.address` encoding inconsistent (hex in example vs bech32 in Zod schema) | Standardized on hex everywhere (CIP-30 native); existing Zod regex is a latent DID bug to fix in Phase 0 |
| 8 | **P1** | Revocation auth underspecified for duplicate/conflicting issue events | Added deterministic VC status reducer: earliest `issue` event in filtered set is canonical issuer |
| 9 | **P1** | VC API missing confirmation semantics (confirmed-only vs include unconfirmed) | Default: confirmed-only; `?includeUnconfirmed=true` query param for post-issuance UX |
| 10 | **P2** | `processor` vs `processors` ambiguous in config contract | Resolved: `processors: Record<number, EventProcessor>` (mandatory, keyed by label) |

### v4 Fixes

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 11 | **P0** | `IndexerConfig` in packages/types can't reference app-layer `EventProcessor` (Drizzle PgTable, Database) | `IndexerConfig` stays processor-agnostic in packages/types; `ResolvedIndexerConfig` extends it with `processors` in indexer app only |
| 12 | **P0** | Canonical issuer "earliest confirmed" conflicts with `includeUnconfirmed=true` (no confirmed issue → unknown even when unconfirmed exists) | Canonical issuer = earliest issue in the **filtered event set**; reducer receives pre-filtered events, rules are mode-independent |
| 13 | **P1** | Reducer tie-breaker `createdAt` is not chain-deterministic (varies across reindexing) | Changed to `blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC` — all immutable chain data (txIndex added in v5 Fix #17) |
| 14 | **P1** | `resolveConfig()` passes `undefined` into `createConfig()`, which spreads over defaults and wipes them | Build overrides object conditionally — only include keys with defined env values |

### v5 Fixes

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 15 | **P0** | COSE_Sign1 verification logic in `verification.ts` is DID-specific; VC processor needs the same COSE decode+verify but can't reuse it | Extract generic `verifyCoseSign1Signature()` into SDK shared utility; both DID `verifyDIDEvent()` and VC `verifyVCEvent()` call it |
| 16 | **P1** | `labels`/`schemas`/`eventsTable` and `processors` are dual sources of truth in config — manual mismatch causes silent bugs | Add startup invariant: assert `processors` keys exactly match `labels` array; derive `schemas` from `processor.schema` instead of duplicating |
| 17 | **P1** | `txHash` tie-breaker is deterministic but doesn't reflect actual ledger tx ordering (txs in same block have an index) | Prefer `txIndex` (Blockfrost `tx_index` field) when available; fall back to `txHash ASC` only if index unavailable |
| 18 | **P3** | Several older bullets/checklist items still say "earliest confirmed issue" instead of "earliest issue in filtered set" | Fixed all occurrences to match the mode-independent reducer semantics (Audit Fix #12) |

### v6 Fixes

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 19 | **P0** | `verify()` always matches signer to `issuerDid`, but `validate` events are signed by a third-party validator — would reject legitimate validator-signed events | Made verification **event-type-aware**: `issue` → signer must match `issuerDid`; `validate` → `validatorDid` required + signer must match `validatorDid`; `revoke` → signer must match canonical issuer (query-time check, not ingest-time) |
| 20 | **P1** | Revocation authorization requires canonical-issuer lookup at ingest time, but `processEvents()` doesn't guarantee chain-order processing — same-batch out-of-order events can produce false `invalid` revokes | Require chain-order processing (`blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC`) in `processEvents()` with immediate per-event persistence before validating later events; revocation canonical-issuer check moved from ingest-time to **query-time** in the reducer |
| 21 | **P2** | Mixed canonical ordering language: some lines say `blockHeight + txHash`, others `blockHeight + txIndex + txHash`, and one still says "earliest confirmed issue" | Normalized **all** canonical ordering references to `blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC` throughout the document |

### v7 Fixes

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 22 | **P1** | `EventProcessor.verify()` returns `Promise<boolean>` but `makeRow()` needs `signerStakeAddress` derived during verification — no way to pass it through | Changed `verify()` to return `Promise<VerifyResult>` (`{ valid, signerStakeAddress?, error? }`); `processEvents()` passes `VerifyResult` into `makeRow()` |
| 23 | **P1** | `processEvents()` sorts by `txIndex` but `MetadataEvent` contract lacks `txIndex` — Blockfrost source doesn't map it | Added Phase 0 sub-task: add `txIndex?: number \| null` to `MetadataEvent` interface + Blockfrost source maps `tx_index` field |
| 24 | **P2** | Revoke verification table says signer must be "a valid DID holder" but pseudocode only checks COSE validity and returns `true` — misleading | Removed "valid DID holder" claim; revoke ingest-time check is COSE_Sign1 validity only (authorization deferred to reducer) |

### v8 Fix

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 25 | **P1** | `makeRow()` receives only `VerifyResult` but `validateChain()` runs after `verify()` and produces its own `{ valid, error }` — chain-validation errors (DID prev-linkage, version/fork) can't reach `makeRow()` for persistence in `validationError` | `processEvents()` owns the final valid/error decision. It merges verify + validateChain outcomes into a `ProcessedResult { valid, validationError, verifyResult }` and passes that to `makeRow()`. `makeRow()` maps domain fields + reads `verifyResult.signerStakeAddress`, but uses `ProcessedResult.valid` and `.validationError` for the row's validity columns. |

---

## VC Signature Model Decision (Audit Fix #1)

**Problem:** CIP-30 `wallet.signData()` produces COSE_Sign1, not raw Ed25519. Standard SD-JWT requires JWS (`base64url(header).base64url(payload).signature`), which needs raw private key access we don't have.

**Decision: COSE-SD format** — Cardano-native selective disclosure credentials.

The credential uses:
- **SD-JWT's disclosure mechanism** (salted hashes, `_sd` array, `base64url([salt, key, value])`) for selective disclosure
- **COSE_Sign1 signing** (via CIP-30 `wallet.signData()`) instead of JWS, consistent with existing DID events
- **Same `payloadSig` wrapper** (`{ sig, key, address }`) that DID events use

**Address encoding (Audit Fix #7):**

`payloadSig.address` is stored as **hex-encoded address bytes** (CIP-30 native format). This is what wallets return from `getUsedAddresses()` and what `wallet.signData()` accepts as its first argument.

Verification pipeline: `hex address` → `Address.from_bytes(hexToBytes(addr))` → `.to_bech32()` → `deriveStakeAddressFromBaseAddress()` → compare to DID stake.

> **Note:** The existing DID code has a latent inconsistency: `PrismaPayloadSigSchema` in `packages/types/src/did.ts:16` validates with regex `/^addr/` (bech32 pattern), but `verification.ts:66` decodes it as hex via `hexToBytes()`. The live system works because CIP-30 wallets store hex addresses and the Zod regex is permissive enough. Phase 0 should tighten the DID Zod regex to `/^[0-9a-f]+$/i` to match actual runtime values. VC events use the correct hex regex from the start.

**Credential format:**
```
Prisma COSE-SD VC = {
  header: { alg: "EdDSA-COSE", vct: "ContributionCredential" }
  payload: { iss, sub, jti, iat, _sd: [...hashes...], <non-disclosable claims> }
  payloadSig: { sig: hex(COSE_Sign1), key: hex(COSE_Key), address: hex(address bytes) }
  disclosures: [ base64url([salt, key, value]), ... ]
}
```

All three `payloadSig` fields are hex strings. `address` is hex-encoded Cardano address bytes — **not** bech32. Verification converts to bech32 internally for stake derivation.

**Wire format** (for storage/transfer): `base64url(JSON.stringify({header, payload, payloadSig}))~disc1~disc2~`

**Verification reuses `verifyDIDEvent()` pattern exactly:**
1. Decode COSE_Sign1 from `payloadSig.sig` (hex → CBOR → `[protectedHeaders, unprotected, payload, signature]`)
2. Extract raw Ed25519 public key from COSE_Key (hex → CBOR → map key `-2`)
3. Build COSE Sig_structure `["Signature1", protectedHeaders, externalAad, payload]`, verify Ed25519
4. Convert `payloadSig.address` from hex → bech32, derive stake address, match to issuer DID

**Why not standard JWS SD-JWT:**
- CIP-30 wallets wrap all signatures in COSE_Sign1 — no raw Ed25519 access
- Private keys never leave the wallet (core security property, §10.3)
- Our DID system already proves COSE_Sign1 works end-to-end (issuing, indexing, verifying)
- Trade-off: not interoperable with standard SD-JWT verifiers. Acceptable for POC; upgrade path to standard JWS exists if issuers manage keypairs outside wallet in future.

---

## Overview

P2 builds the Verifiable Credentials layer on top of the existing DID infrastructure (P0+P1). The DID system is live — wallets create DIDs, metadata lands on Cardano, the indexer verifies COSE_Sign1 signatures and serves resolution via REST API. Now we add credential issuance, selective disclosure, on-chain anchoring, revocation, and wire the existing VC Interface mockup to real SDK functions + a VC Indexer config.

**Architecture principle:** Same indexer codebase, different config. The DID Indexer (global, Prisma-operated) indexes L_DID=199674. The VC Indexer (forkable, per-org) indexes L_VC=199675. Organizations fork and deploy their own.

---

## Phase Breakdown

### Phase 0: Indexer Processor Generalization (Audit Fix #3)
> Prerequisite gate — must complete before Phase 5

**Problem:** The current processor (`processor.ts`) is hardcoded to `did_events` in 6 places:
- `import { didEvents }` (line 4) — hardcoded table
- `parseResult.data as DIDEvent` (line 60) — hardcoded type
- `verifyDIDEvent(event)` (line 65) — DID-specific verification
- `validateDIDChain(db, event, raw.txHash)` (line 77) — DID-specific chain validation
- `typeof didEvents.$inferInsert` (line 95) — hardcoded row type
- `db.insert(didEvents)` (line 99) — hardcoded insert

The poller (`poller.ts`) is also hardcoded in:
- `this.db.update(didEvents)` (line 204) — confirmation pass
- `this.db.delete(didEvents)` (line 232) — reorg handling
- `didEvents.blockHeight` queries (lines 239-251)

**Goal:** Create a processor registry that dispatches by label/config so DID and VC processors share the same poller infrastructure.

#### 0.0 Fix DID `payloadSig.address` Zod regex (Audit Fix #7)
- In `packages/types/src/did.ts:16`, change `address: z.string().regex(/^addr/)` to `address: z.string().regex(/^[0-9a-f]+$/i)` to match actual hex-encoded address bytes from CIP-30 wallets.
- Verify existing DID events still validate (they store hex, so this is a correctness fix, not a behavior change).

#### 0.1 Extract shared COSE_Sign1 verification (Audit Fix #15)

The existing `verifyDIDEvent()` in `packages/sdk/src/core/verification.ts` embeds COSE_Sign1 decode + Ed25519 verify + stake derivation as a monolith. The VC processor needs the same COSE verification but with different domain logic (match issuerDid vs match DID id).

**Extract `verifyCoseSign1Signature()` into `packages/sdk/src/core/cose-verify.ts`:**
```typescript
// packages/sdk/src/core/cose-verify.ts
export interface CoseVerifyResult {
  valid: boolean;
  signerStakeAddress?: string;  // derived from payloadSig.address
  error?: string;
}

/**
 * Generic COSE_Sign1 signature verification + stake address derivation.
 * Reused by both DID event verification and VC event verification.
 */
export async function verifyCoseSign1Signature(
  payloadSig: { sig: string; key: string; address: string }
): Promise<CoseVerifyResult>
```

Steps:
1. Decode COSE_Sign1 from `payloadSig.sig` (hex → CBOR)
2. Extract Ed25519 public key from COSE_Key (`payloadSig.key`)
3. Build Sig_structure, verify Ed25519
4. Convert `payloadSig.address` hex → bech32 → derive stake address
5. Return `{ valid, signerStakeAddress }`

**Refactor `verifyDIDEvent()`** to call `verifyCoseSign1Signature()` then compare `signerStakeAddress` to `event.id.replace('did:cardano:', '')`.

**VC `verifyVCEvent()`** (Phase 4.3) calls `verifyCoseSign1Signature()` then performs event-type-aware signer matching: `issue`→`issuerDid`, `validate`→`validatorDid`, `revoke`→stores signer for query-time authorization (Audit Fix #19).

Both callers are thin wrappers — all cryptographic work lives in the shared function.

#### 0.2 Define `EventProcessor` interface (Audit Fix #11)

`EventProcessor` lives in the **indexer app** (`apps/indexer/src/worker/types.ts`), **not** in `packages/types`. It references Drizzle's `PgTable` and the app's `Database` type — these are app-layer dependencies that `packages/types` must not import.

`IndexerConfig` in `packages/types/src/config.ts` stays **unchanged** — it keeps `labels`, `schemas`, `eventsTable` as-is. The indexer app defines a local extended type:

```typescript
// apps/indexer/src/worker/types.ts
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

// apps/indexer/src/config/types.ts
import type { IndexerConfig } from '@prisma-dids/types';
import type { EventProcessor } from '../worker/types.js';

/** IndexerConfig + app-layer processor binding. Only used inside the indexer app. */
export interface ResolvedIndexerConfig extends IndexerConfig {
  processors: Record<number, EventProcessor>;
}
```

The config files (`did-indexer.ts`, `vc-indexer.ts`) return `ResolvedIndexerConfig`. `loadConfig()` returns `ResolvedIndexerConfig`. Poller and processor consume `ResolvedIndexerConfig`. `packages/types` never sees `EventProcessor`.

#### 0.3 Extract DID processor as first implementation
- Create `apps/indexer/src/worker/did-processor.ts` implementing `EventProcessor`
- Move DID-specific logic (verifyDIDEvent, validateDIDChain, makeRow) out of `processor.ts`
- `processor.ts` becomes generic: accepts `EventProcessor`, runs the pipeline

#### 0.4 Add `txIndex` to `MetadataEvent` + Blockfrost source (Audit Fix #23)

The current `MetadataEvent` interface (`apps/indexer/src/sources/types.ts`) lacks `txIndex`:
```typescript
// Current:
export interface MetadataEvent {
  txHash: string;
  blockHeight: number;
  blockHash: string;
  blockTime: number;
  jsonMetadata: unknown;
}
```

Add `txIndex` so `processEvents()` can sort in chain order:
```typescript
export interface MetadataEvent {
  txHash: string;
  txIndex?: number | null;  // ← ADDED: Blockfrost tx_index within block; null if unavailable
  blockHeight: number;
  blockHash: string;
  blockTime: number;
  jsonMetadata: unknown;
}
```

Update `BlockfrostSource` to map `tx_index` from Blockfrost API responses into `MetadataEvent.txIndex`. If the field is unavailable (older Blockfrost API versions or non-Blockfrost sources), leave as `undefined`/`null` — the sort falls back to `txHash ASC`.

**Files modified:** `apps/indexer/src/sources/types.ts`, `apps/indexer/src/sources/blockfrost.ts`

#### 0.5 Make `processEvents()` generic (Audit Fix #20, #22)
```typescript
// processor.ts — now generic
export async function processEvents(
  db: Database,
  events: MetadataEvent[],
  processor: EventProcessor
): Promise<ProcessResult>
```
- **Sort events before processing:** `blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC` — ensures chain-order processing so earlier events are persisted before later events are validated (Audit Fix #20). Requires `txIndex` on `MetadataEvent` (Phase 0.4).
- **Persist each event immediately** after verify + validateChain, before processing the next — ensures lookup queries (e.g., canonical issuer for revoke authorization at query time) see all prior events
- Uses `processor.table` for insert/conflict
- Calls `processor.verify()` → `VerifyResult` (carries `valid`, `signerStakeAddress`, `error`)
- Calls `processor.validateChain?.()` (optional — VC skips this)
- **Merges outcomes into `ProcessedResult`** (Audit Fix #25):
  ```typescript
  const verifyResult = await processor.verify(event);
  const chainResult = await processor.validateChain?.(db, event, raw.txHash)
    ?? { valid: true };
  const processedResult: ProcessedResult = {
    valid: verifyResult.valid && chainResult.valid,
    validationError: verifyResult.error ?? chainResult.error ?? null,
    verifyResult,  // signer context preserved for makeRow()
  };
  const row = processor.makeRow(raw, event, processedResult);
  ```
- `makeRow()` reads `processedResult.valid` and `.validationError` for the row's validity columns, and `processedResult.verifyResult.signerStakeAddress` for domain-specific columns (e.g., VC revoke auth)

#### 0.6 Make poller table-aware (Audit Fix #10, #11)
- Poller constructor accepts `ResolvedIndexerConfig` (defined in indexer app, extends `IndexerConfig` from packages/types).
- `ResolvedIndexerConfig.processors: Record<number, EventProcessor>` — mandatory, keyed by label.
- Poller iterates `Object.entries(config.processors)` instead of `config.labels`, getting both label and processor per iteration.
- Confirmation pass iterates all processors, calling `db.update(processor.table)` for each.
- Reorg handling iterates all processors, calling `db.delete(processor.table)` for each.
- `IndexerConfig.labels` and `.schemas` in packages/types stay as-is (used for non-processor contexts like health checks). Config files set both: base `IndexerConfig` fields + `processors` field.

##### 0.6.1 Config Invariant (Audit Fix #16)

**Problem:** `labels`, `schemas`, and `processors` can drift silently if set independently. A missing processor for a label means events are fetched but never processed.

**Solution:** Add a startup validation in `loadConfig()` that asserts consistency:
```typescript
function validateConfig(config: ResolvedIndexerConfig): void {
  const processorLabels = Object.keys(config.processors).map(Number);
  const missingProcessors = config.labels.filter(l => !config.processors[l]);
  const orphanProcessors = processorLabels.filter(l => !config.labels.includes(l));

  if (missingProcessors.length > 0)
    throw new Error(`Labels missing processors: ${missingProcessors}`);
  if (orphanProcessors.length > 0)
    throw new Error(`Processors without labels: ${orphanProcessors}`);
}
```

Additionally, derive `schemas` from processors where possible — each `EventProcessor` already has a `.schema` field. Config files can omit the redundant `schemas` object and let `loadConfig()` build it from `processors`:
```typescript
// In loadConfig(), after merging base config + processors:
config.schemas = Object.fromEntries(
  Object.entries(config.processors).map(([label, proc]) => [Number(label), proc.schema])
);
```

This makes `processors` the single source of truth for per-label schema validation. `IndexerConfig.schemas` in packages/types stays in the type definition (for non-processor consumers like health checks) but the indexer app derives it from processors at startup.

#### 0.7 Verify DID Indexer still works identically
- Deploy with `INDEXER_CONFIG=did`, verify behavior unchanged
- Existing DID events resolve correctly via API

**Files modified:** `processor.ts` (refactor), `poller.ts` (refactor), `load-config.ts` (invariant), `sources/types.ts` (txIndex), `sources/blockfrost.ts` (tx_index mapping)
**Files created:** `worker/types.ts`, `worker/did-processor.ts`, `core/cose-verify.ts` (SDK)

---

### Phase 1: `packages/schemas` — Credential Type Definitions
> POC tasks: 2A.0a, 2A.0b, 2A.0c, 2A.0d

**Goal:** Create a shared package that both VC Interface and VC Indexer depend on for credential schema validation. Single source of truth for claim enums (Audit Fix #6).

#### 1.1 Package scaffolding (`2A.0a`)
- Create `packages/schemas/` with `package.json` (`@prisma-dids/schemas`, ESM, Zod peer dep)
- `tsconfig.json` extending root config
- Add to Turborepo pipeline (`turbo.json`)
- Wire as workspace dependency in `apps/indexer`, `apps/vc-interface`, and `packages/sdk`

#### 1.2 Base credential schema types (`2A.0b`)
- `src/base.ts` — Base Zod schemas shared by all credential types:
  ```
  BaseCredentialSchema {
    iss: z.string()         // issuer DID
    sub: z.string()         // holder DID
    jti: z.string().regex() // urn:uuid format (§7.4)
    iat: z.number()         // issued-at unix timestamp
    exp: z.number().optional()
    vct: z.string()         // credential type discriminator
  }
  ```
- `src/vc-event.ts` — On-chain VC event schema with signature wrapper (Audit Fix #2):
  ```
  VCEventPayloadSchema {
    event: z.enum(['issue', 'validate', 'revoke'])
    issuerDid: z.string()
    holderDid: z.string()
    vcHash: z.string()
    vcType: z.string()
    vcFormat: z.enum(['cose-sd', 'ed25519'])
    validatorDid: z.string().optional()
    reason: z.string().optional()
    payloadSig: z.string()   // ← ADDED: JSON.stringify({ sig, key, address })
  }
  ```
  The `payloadSig` field uses `PrismaPayloadSig` structure: `{ sig: hex, key: hex, address: hex }`.
  All three fields are hex strings (Audit Fix #7). The `address` field is hex-encoded Cardano address bytes (CIP-30 native format), **not** bech32.
  The indexer verifies: (a) COSE_Sign1 signature is valid, (b) signer matches the expected DID per event type (`issuerDid` for `issue`, `validatorDid` for `validate`; revoke authorization deferred to query-time reducer — see Audit Fix #19, #20).

#### 1.3 ContributionCredential schema (`2A.0c`)
- `src/credentials/contribution.ts`:
  ```
  // Canonical contributionType enum — single source, consumed by UI and indexer
  ContributionTypeEnum = z.enum(['code', 'design', 'documentation', 'review', 'mentorship', 'other'])

  ContributionCredentialSchema extends BaseCredentialSchema {
    projectId: z.string()
    contributionType: ContributionTypeEnum
    hours: z.number().positive().optional()
    organization: z.string()
    description: z.string().optional()
    evidenceUrl: z.string().url().optional()
  }
  ```
- **Enum alignment (Audit Fix #6):** The enum values match the existing UI (`types/vc.ts:61`): `code | design | documentation | review | mentorship | other`. The UI's `ContributionCredentialClaims` type will be replaced by re-exporting `z.infer<typeof ContributionCredentialSchema>` from this package.
- Define `disclosableFields` array per type (which claims support selective disclosure)

#### 1.4 Schema registry pattern (`2A.0d`)
- `src/registry.ts`:
  ```typescript
  const schemaRegistry = new Map<string, { schema: ZodSchema, disclosableFields: string[] }>()
  registerSchema(vct: string, schema, disclosableFields)
  getSchema(vct: string) → { schema, disclosableFields } | undefined
  listSchemas() → { vct, disclosableFields }[]
  ```
- Pre-register `ContributionCredential`
- Export everything from `src/index.ts`

#### 1.5 Update VC Interface types to consume schemas
- `apps/vc-interface/types/vc.ts`:
  - `ContributionCredentialClaims` re-exports from `@prisma-dids/schemas`
  - `CredentialType` stays local (UI may support subset of all schemas)
  - `contributionType` enum comes from schemas, not duplicated

**Files created:** ~7 files in `packages/schemas/`
**Files modified:** `apps/vc-interface/types/vc.ts`

---

### Phase 2: SDK VC Functions
> POC tasks: 2A.1, 2A.2, 2A.3, 2A.4

**Goal:** Add VC issuance, presentation, and verification to `packages/sdk` using COSE-SD format.

#### 2.1 `issueSDJwtVC()` (`2A.1`)
- New file: `packages/sdk/src/core/vc.ts`
- **Inputs:** issuer wallet (CIP-30), holder DID, claims object, options `{ disclosable: string[] }`
- **Process (COSE-SD model):**
  1. Validate claims against schema registry (`@prisma-dids/schemas`)
  2. Generate `jti` as `urn:uuid:<uuid-v4>`
  3. For each disclosable claim: generate random salt, create disclosure `[salt, key, value]`, base64url-encode, compute SHA-256 hash for `_sd` array
  4. Build VC payload: `{ iss, sub, jti, iat, vct, _sd: [hashes...], <non-disclosable claims> }`
  5. Serialize payload as JSON, call `wallet.signData(signingAddress, payloadHex)` — produces COSE_Sign1 (same as `signDIDPayload()` in `signature.ts`)
  6. Return: `{ credential: "<base64url(envelope)>~<disc1>~<disc2>~", jti, payloadSig }`
- **Dependencies:** `@prisma-dids/schemas` for claim validation
- Helper: `src/core/sd-jwt.ts` — disclosure creation, `_sd` hash computation, base64url helpers, credential parsing

#### 2.2 `createPresentation()` (`2A.2`)
- **Inputs:** full credential string, `claimsToDisclose: string[]`
- **Process:**
  1. Parse credential: split on `~` → envelope part + disclosures
  2. Decode each disclosure to find its claim key
  3. Filter disclosures to only include selected claims
  4. Reassemble: `<envelope>~<selected_disc1>~<selected_disc2>~`
- **Output:** presentation string (subset of disclosures)

#### 2.3 `verifyPresentation()` (`2A.3`)
- **Inputs:** presentation string, options `{ checkRevocation?: boolean, indexerEndpoint?: string }`
- **Process:**
  1. Split presentation into envelope + disclosures
  2. Decode envelope → extract `payloadSig`
  3. Verify COSE_Sign1 signature (reuse logic from `verifyDIDEvent()` in `verification.ts`)
  4. Derive stake address from `payloadSig.address`, match to `iss` (issuer DID)
  5. Verify each disclosure matches its `_sd` hash in the payload
  6. If `checkRevocation`: extract `jti`, query indexer `/vc/:vcHash/status`
  7. Return `{ valid: boolean, claims: Record<string, any>, issuer: string, holder: string }`

#### 2.4 `getDisclosableClaims()` (`2A.4`)
- **Inputs:** full credential string (with all disclosures)
- **Process:**
  1. Parse all disclosures
  2. Decode each `[salt, key, value]` triple
  3. Return array of `{ key, value, disclosed: boolean }` for UI rendering

**Files created/modified:** `packages/sdk/src/core/vc.ts`, `packages/sdk/src/core/sd-jwt.ts`, update `packages/sdk/src/index.ts` exports

---

### Phase 3: VC Anchoring + Revocation
> POC tasks: 2A.5, 2A.6, 2B.1, 2B.2, 2B.3, 2B.4
> **Merged:** Anchoring and revocation are both "VC metadata tx" builders. Building them together avoids duplicate tx plumbing.

**Goal:** On-chain VC event submission (issue, validate, revoke) + status checking.

**MVP slice order:** issue anchor → `/vc/:hash/status` query → revoke anchor. This enables the core loop before wiring full UI.

#### 3.1 VC anchor schema (`2B.1`)
- In `packages/schemas/src/vc-event.ts` (from Phase 1)
- `vcHash` = `jti` for COSE-SD, SHA-256 for Ed25519 (per §8.2)
- `computeEd25519VcHash()` using RFC 8785 canonicalization + SHA-256

#### 3.2 VC issuance anchor builder (`2B.2`)
- `packages/sdk/src/core/vc-anchor.ts`:
  ```typescript
  async function anchorVCIssuance(
    wallet: CIP30API,
    signingAddress: string,
    params: { issuerDid, holderDid, vcHash, vcType, vcFormat }
  ): Promise<{ txHash: string }>
  ```
- Builds `VCEventPayload` with `event: 'issue'`
- Signs payload via `wallet.signData()` → `payloadSig` (same COSE pattern)
- Serializes to L_VC (199675) metadata with 64-byte chunking
- Submits tx via Lucid (reuses `src/tx/builder.ts` pattern)

#### 3.3 VC validation anchor (`2B.3`)
- `anchorVCValidation()` — third-party validation events
- Same pattern, `event: 'validate'`, includes `validatorDid`

#### 3.4 `revokeVC()` (`2A.5`)
- `anchorVCRevocation()` in same file
- `event: 'revoke'`, includes optional `reason`
- Signer should be the issuer — indexer stores the event; reducer verifies revoke authorization at query time (Audit Fix #20)

#### 3.5 `checkRevocationStatus()` (`2A.6`)
- **Inputs:** `vcHash` (jti string), `indexerEndpoint` URL
- **Process:** `GET {indexerEndpoint}/vc/{vcHash}/status`
- **Output:** `{ status: 'active' | 'revoked' | 'unknown', revokedAt?: string, reason?: string }`

#### 3.6 VC anchor provider interface (`2B.4`)
- Abstract interface for future backend swaps:
  ```typescript
  interface VCAnchorProvider {
    anchorIssuance(params): Promise<{ txHash: string }>
    anchorValidation(params): Promise<{ txHash: string }>
    anchorRevocation(params): Promise<{ txHash: string }>
  }
  ```
- Default: `CardanoVCAnchorProvider` (Lucid + Blockfrost)

**Files created:** `packages/sdk/src/core/vc-anchor.ts`

---

### Phase 4: VC Indexer Config + Routes
> POC tasks: 2C.6, 2C.7, 2C.8

**Goal:** Add VC Indexer config to the existing configurable indexer (using generalized processor from Phase 0).

#### 4.1 VC Indexer config file (`2C.6`)
- New file: `apps/indexer/src/config/vc-indexer.ts`
  ```typescript
  import type { ResolvedIndexerConfig } from '../config/types.js';

  export const vcIndexerConfig: ResolvedIndexerConfig = {
    // IndexerConfig base fields (packages/types)
    name: 'VC Indexer',
    labels: [L_VC],
    eventsTable: 'vc_events',
    schemas: { [L_VC]: VCEventPayloadSchema },
    endpoints: [...],
    network: process.env.NETWORK || 'preprod',
    pollIntervalMs: 30_000,
    confirmationDepth: 10,
    // App-layer processor binding (indexer-only)
    processors: { [L_VC]: vcEventProcessor },
  }
  ```
- Register in `load-config.ts`: `configs.vc = vcIndexerConfig`

#### 4.2 VC-specific database table + migration
- Add `vc_events` table to `apps/indexer/src/db/schema.ts`:
  ```
  id (uuid PK), txHash (unique), txIndex (integer nullable), event (text),
  issuerDid (text), holderDid (text), validatorDid (text nullable),
  signerStakeAddress (text),  -- derived at ingest from payloadSig.address; used by reducer for revoke auth
  vcHash (text, indexed), vcType (text), vcFormat (text),
  reason (text nullable), valid (boolean), validationError (text nullable),
  confirmed (boolean), confirmedAtHeight (bigint nullable),
  blockHeight (bigint, indexed), timestamp (timestamp with TZ),
  rawEvent (text), createdAt (timestamp with TZ, indexed)
  ```
- Indices: `idx_vc_hash`, `idx_vc_issuer_did`, `idx_vc_holder_did`, `idx_vc_block_height`
- Generate Drizzle migration

#### 4.3 VC event processor (`2C.8`)
- New file: `apps/indexer/src/worker/vc-processor.ts` implementing `EventProcessor`:

  **`verify()` — event-type-aware signature verification (Audit Fix #19):**

  All event types share the same COSE_Sign1 check via `verifyCoseSign1Signature()` from `@prisma-dids/sdk` (Audit Fix #15). The difference is **who** the signer must be:

  | Event type | Signer must match | Validation rule |
  |-----------|-------------------|-----------------|
  | `issue` | `issuerDid` | `signerStakeAddress === issuerDid.replace('did:cardano:', '')` |
  | `validate` | `validatorDid` | `validatorDid` must be present (non-null); `signerStakeAddress === validatorDid.replace('did:cardano:', '')` |
  | `revoke` | *(any valid signer)* | COSE_Sign1 signature valid (cryptographic check only). **Canonical-issuer authorization is checked at query time** by the status reducer (§4.3.1), not at ingest time — see Audit Fix #20. |

  ```typescript
  async verify(event: VCEventPayload): Promise<VerifyResult> {
    const payloadSig = JSON.parse(event.payloadSig);
    const coseResult = await verifyCoseSign1Signature(payloadSig);
    if (!coseResult.valid) return { valid: false, error: coseResult.error };

    switch (event.event) {
      case 'issue':
        const issuerMatch = coseResult.signerStakeAddress === event.issuerDid.replace('did:cardano:', '');
        return { valid: issuerMatch, signerStakeAddress: coseResult.signerStakeAddress,
                 error: issuerMatch ? undefined : 'signer_not_issuer' };
      case 'validate':
        if (!event.validatorDid) return { valid: false, error: 'missing_validator_did' };
        const validatorMatch = coseResult.signerStakeAddress === event.validatorDid.replace('did:cardano:', '');
        return { valid: validatorMatch, signerStakeAddress: coseResult.signerStakeAddress,
                 error: validatorMatch ? undefined : 'signer_not_validator' };
      case 'revoke':
        // COSE_Sign1 cryptographic validity checked above.
        // Authorization (signer = canonical issuer) deferred to query-time reducer.
        return { valid: true, signerStakeAddress: coseResult.signerStakeAddress };
    }
  }
  ```

  **Why revoke authorization is query-time, not ingest-time (Audit Fix #20):**
  At ingest time, the canonical issuer may not yet be in the database (same-batch ordering, reindexing, etc.). Marking a revoke as `valid=false` at ingest is irreversible — reindexing would need to re-evaluate every revoke. Instead:
  - Ingest stores all syntactically valid revokes with `valid=true`
  - The status reducer (§4.3.1) checks revocation authorization: only revokes where `payloadSig` signer matches the canonical issuer's `issuerDid` are honored
  - `makeRow()` reads `processedResult.verifyResult.signerStakeAddress` and stores it in the `signerStakeAddress` column for the reducer to compare without re-decoding COSE (Audit Fix #22, #25)

  - `validateChain()`: **none** — VC events are independent (no `prev` pointer chain). Return `{ valid: true }`.
  - `makeRow(raw, event, processedResult)`: maps `VCEventPayload` fields to `vc_events` columns. Uses `processedResult.valid` and `.validationError` for the row's validity fields, and reads `processedResult.verifyResult.signerStakeAddress` to populate the `signerStakeAddress` column (Audit Fix #22, #25).

##### 4.3.1 VC Status Reducer (Audit Fix #8, #12, #13)

**Problem:** Multiple `issue` events for the same `vcHash` can exist (duplicate submissions, reorgs, conflicts). We need deterministic rules for canonical issuer lookup and status computation that work consistently across both confirmed-only and includeUnconfirmed modes.

**Canonical issuer rule:** The **earliest `issue` event in the filtered event set** (ordered by `blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC`) defines the canonical issuer. The "filtered event set" depends on the query mode:
- **Confirmed-only** (default): only events where `confirmed = true`
- **Include unconfirmed** (`?includeUnconfirmed=true`): all events where `valid = true`

This means the reducer is mode-independent — it always operates on "earliest issue in whatever events it receives." The caller filters before passing to the reducer.

**Tie-breaking (Audit Fix #13, #17):** `blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC`. All fields are immutable chain data.
- `txIndex` (Blockfrost `tx_index` field within a block) is the **preferred** intra-block ordering — it reflects actual ledger position.
- If `txIndex` is unavailable (older data, non-Blockfrost source), fall back to `txHash ASC` (deterministic but arbitrary).
- The `vc_events` and `did_events` tables store `txIndex` as a nullable integer column. The poller populates it from Blockfrost's response when available.
- Never use `createdAt` (indexer-local insertion timestamp) for ordering.

**Status reducer** (applied by `/vc/:vcHash/status` endpoint):
```
reduceVCStatus(events: VCEvent[]): VCStatus
  // events are pre-filtered (confirmed-only or all valid) by the endpoint handler
  1. Sort by blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC
  2. Find first event where event.event === 'issue' → this is the canonical issuer
  3. If no issue event exists → status: 'unknown'
  4. canonicalIssuerStake = canonical issuer's issuerDid.replace('did:cardano:', '')
  5. Scan for any event where event.event === 'revoke'
     AND event.signerStakeAddress === canonicalIssuerStake → status: 'revoked'
     (signerStakeAddress was stored at ingest time by makeRow(); no COSE re-decode needed)
  6. Revoke events where signerStakeAddress ≠ canonicalIssuerStake are ignored (unauthorized)
  7. Otherwise → status: 'active'
```

**Revocation authorization (Audit Fix #19, #20):** Authorization is checked **at query time** by the reducer, not at ingest time. This is critical because:
- At ingest time, the canonical issuer may not yet exist in the DB (same-batch or out-of-order arrival)
- Storing revokes with `valid=true` and deferring authorization to the reducer avoids irreversible false-invalid decisions
- The reducer compares `revoke.signerStakeAddress` (stored in the row) against `canonical issuer.issuerDid` — fast, no COSE re-decode
- Unauthorized revoke events are not errors — they're simply ignored by the reducer (they remain in storage but have no status effect)

**Duplicate issue events:** Stored but only the earliest (by `blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC`) is canonical. Later duplicates are harmless (idempotent status).

**Unconfirmed interaction (Audit Fix #12):** When `includeUnconfirmed=true`, an unconfirmed `issue` event CAN be the canonical issuer — enabling the post-submit "pending" UX. When confirmed-only (default), only confirmed issues qualify — safe for verifiers. The reducer doesn't care; it just takes the events it's given.

#### 4.4 VC-specific endpoints (`2C.7`)
- New file: `apps/indexer/src/api/vc-routes.ts`
  | Endpoint | Handler ID | Description |
  |----------|-----------|-------------|
  | `GET /vc/:vcHash` | `vc:resolve` | All anchor events for a credential |
  | `GET /vc/:vcHash/status` | `vc:status` | Current status (active/revoked) |
  | `GET /issuer/:did/credentials` | `vc:issuer-list` | Paginated VCs by issuer |
  | `GET /holder/:did/credentials` | `vc:holder-list` | Paginated VCs by holder |
  | `GET /schemas` | `vc:schemas` | Supported schemas from `@prisma-dids/schemas` registry |
- All list endpoints support `?limit=&offset=&order=` pagination (per §9.3)
- Register handlers in `server.ts` handler registry

##### 4.4.1 Confirmation Semantics (Audit Fix #9)

**Problem:** After issuance/revocation, the user submits a tx and wants immediate feedback. But the indexer's confirmation pass (default depth=10 blocks, ~3-5 minutes) means the event won't be `confirmed=true` yet. If endpoints default to confirmed-only, the UI shows nothing after submit.

**Default behavior:** All VC endpoints default to **confirmed events only** (`WHERE confirmed = true`). This is the safe default for verifiers — they should not trust unconfirmed anchors.

**Unconfirmed override:** Endpoints accept `?includeUnconfirmed=true` query parameter:
- When set, results include events where `confirmed = false`
- Each event in the response includes a `confirmed: boolean` field so consumers can distinguish
- The VC Interface uses `includeUnconfirmed=true` for the issuer's post-submit UX (show "pending confirmation" badge)
- Verifiers/external consumers use the default (confirmed-only)

**Status endpoint specifics (`/vc/:vcHash/status`)** (Audit Fix #12):
| `includeUnconfirmed` | Event filter | Canonical issuer source | Behavior |
|---------------------|-------------|------------------------|----------|
| `false` (default) | `WHERE valid=true AND confirmed=true` | Earliest issue in filtered set | Unconfirmed issue → `unknown`. Unconfirmed revoke → still `active`. Safe for verifiers. |
| `true` | `WHERE valid=true` | Earliest issue in filtered set | Unconfirmed issue → `active` with `confirmed: false`. Enables post-submit UX. |

The reducer (§4.3.1) is called identically in both modes — only the input filter changes.

**Example response with unconfirmed:**
```json
{
  "vcHash": "urn:uuid:...",
  "status": "active",
  "confirmed": false,
  "issuer": "did:cardano:stake1u9...",
  "issuedAt": "2026-02-15T10:30:00Z",
  "issuedTxConfirmed": false
}
```

This gives the UI enough information to show "Credential issued — awaiting blockchain confirmation" without compromising verifier trust.

**Files created:** `vc-indexer.ts`, `vc-routes.ts`, `vc-processor.ts`, Drizzle migration
**Files modified:** `db/schema.ts`, `api/server.ts`, `config/load-config.ts`

---

### Phase 5: VC Interface Integration (Mockup → Functional)
> POC tasks: 2C.1, 2C.2, 2C.3, 2C.4, 2C.5

**Goal:** Wire the existing 7 VC Interface mockup components to real SDK functions.

#### 5.1 Config resolution strategy (Audit Fix #5)
- `org-config.ts` remains the fork-time static default (no changes to the file itself)
- New file: `apps/vc-interface/lib/resolve-config.ts` (Audit Fix #14):
  ```typescript
  import { createConfig } from '@/config/org-config';
  import type { VCInterfaceConfig } from '@/config/org-config';

  // At app bootstrap, merge env overrides on top of fork-time defaults.
  // Only include keys with actual env values — never pass undefined
  // (spreading undefined over defaults would wipe them).
  export function resolveConfig(): VCInterfaceConfig {
    const overrides: Partial<VCInterfaceConfig> = {};

    if (process.env.NEXT_PUBLIC_ORG_NAME)
      overrides.ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME;
    if (process.env.NEXT_PUBLIC_INDEXER_ENDPOINT)
      overrides.INDEXER_ENDPOINT = process.env.NEXT_PUBLIC_INDEXER_ENDPOINT;
    if (process.env.NEXT_PUBLIC_DID_INDEXER_ENDPOINT)
      overrides.DID_INDEXER_ENDPOINT = process.env.NEXT_PUBLIC_DID_INDEXER_ENDPOINT;
    if (process.env.NEXT_PUBLIC_NETWORK)
      overrides.NETWORK = process.env.NEXT_PUBLIC_NETWORK as 'preprod' | 'mainnet';

    return createConfig(overrides);
  }
  ```
- `layout.tsx` calls `resolveConfig()` once, passes to providers
- Components continue using `config` prop (no change to component code) — but the root page passes the resolved config instead of raw `defaultConfig`
- Forkers edit `org-config.ts` for their defaults. Env vars override at deploy time. Single source of truth, minimal code churn.

#### 5.2 Wallet context for VC Interface
- Port `WalletContext.tsx` + `useWallet()` from dashboard
- Provides: connected wallet, signing address, derived DID, network info
- Used by all issuance/revocation flows

#### 5.3 IssuanceForm → `issueSDJwtVC()` (`2C.1`)
- Create `apps/vc-interface/services/vcService.ts` — service layer
- Wire `IssuanceForm.onSubmit` to:
  1. Call `issueSDJwtVC()` from SDK (produces COSE-SD credential)
  2. Call `anchorVCIssuance()` to anchor on-chain under L_VC
  3. Show real tx hash on success (replace mock `'mock_tx_hash_' + Date.now()` on `IssuanceForm.tsx:98`)

#### 5.4 CredentialInbox → VC Indexer (`2C.2`)
- Wire `CredentialInbox` to fetch holder's credentials:
  ```
  GET {INDEXER_ENDPOINT}/holder/{holderDid}/credentials
  ```
- Create API proxy route: `apps/vc-interface/app/api/vc/[...path]/route.ts`
- Map indexer response to existing `VerifiableCredential` type

#### 5.5 SelectiveDisclosure → `createPresentation()` (`2C.3`)
- Wire `SelectiveDisclosure` component:
  1. Use `getDisclosableClaims()` to populate claim checkboxes
  2. On submit: call `createPresentation()` with selected claims
  3. Display/copy resulting presentation string

#### 5.6 RevocationUI → `revokeVC()` (`2C.4`)
- Wire `RevocationUI.onRevoke` to:
  1. Call `anchorVCRevocation()` from SDK (submits on-chain revocation)
  2. Refresh credential status from indexer
  3. Update UI to show revoked state

#### 5.7 VCIndexer service endpoint in DID Documents (`2C.5`)
- When issuing VCs, check if issuer's DID Document has a `VCIndexer` service entry
- If not, prompt to update DID Document via `updateDID()` adding:
  ```json
  { "id": "...#vc-indexer", "type": "VCIndexer", "serviceEndpoint": "https://..." }
  ```
- This enables **verifier discovery**: verifiers resolve issuer DID → find indexer → check revocation

**Files created:** `resolve-config.ts`, `vcService.ts`, API proxy route, wallet context
**Files modified:** `layout.tsx`, `IssuanceForm.tsx`, `CredentialInbox.tsx`, `SelectiveDisclosure.tsx`, `RevocationUI.tsx`

---

### Phase 6: Forkability Infrastructure
> POC tasks: 2C.9, 2C.10, 2C.11, 2C.12

#### 6.1 `.env.example` for vc-interface (`2C.9`)
```env
# Override org-config.ts defaults at deploy time (all optional)
NEXT_PUBLIC_ORG_NAME=YourOrganization
NEXT_PUBLIC_INDEXER_ENDPOINT=https://your-vc-indexer.example.com
NEXT_PUBLIC_DID_INDEXER_ENDPOINT=https://prisma-didsindexer-production.up.railway.app
NEXT_PUBLIC_NETWORK=preprod
BLOCKFROST_API_KEY=your-key
PINATA_JWT=your-jwt
```

#### 6.2 `.env.example` for indexer (`2C.10`)
```env
INDEXER_CONFIG=vc-indexer
DATABASE_URL=postgresql://...
BLOCKFROST_API_KEY=your-key
NETWORK=preprod
PORT=3001
```
> Note: uses `BLOCKFROST_API_KEY` (Audit Fix #4), matching `apps/indexer/src/index.ts:20`.

#### 6.3 Example fork config: ALJ (`2C.11`)
- `apps/indexer/src/config/alj-vc-indexer.ts` — ALJ pilot config
- Same structure as `vc-indexer.ts`, registered in `load-config.ts`

#### 6.4 Deploy ALJ VC Indexer (`2C.12`)
- Deploy to Railway as separate service (`INDEXER_CONFIG=alj-vc-indexer`)
- Wire ALJ VC Interface fork to this indexer endpoint

---

### Phase 7: Testing
> POC tasks: 2D.1 through 2D.6

#### 7.1 Unit tests for SDK VC functions (`2D.1`)
- `packages/sdk/tests/vc.test.ts`:
  - `issueSDJwtVC()` produces valid COSE-SD structure
  - Disclosable claims are properly hashed in `_sd` array
  - `jti` is URN UUID format
  - Schema validation rejects invalid claims
  - `payloadSig` contains valid COSE_Sign1 structure

#### 7.2 E2E test: issue → present → verify (`2D.2`)
- Full pipeline with mocked wallet:
  1. Issue COSE-SD VC with 3 disclosable claims
  2. Create presentation revealing 1 claim
  3. Verify presentation — check only 1 claim visible
  4. Verify COSE_Sign1 signature is valid
  5. Verify issuer DID matches signing address

#### 7.3 Revocation test suite (`2D.3`)
- Issue VC → anchor → revoke → verify revocation status
- Verify that `verifyPresentation()` fails after revocation
- Verify revocation `payloadSig` proves issuer authorization

#### 7.4 Integration tests: SDK + Indexer (`2D.4`)
- Spin up indexer with VC config in test mode
- Submit VC events, verify they appear via API endpoints
- Verify processor dispatches correctly (VC events → `vc_events` table)

#### 7.5 jti hash strategy test (`2D.5`)
- Issue COSE-SD VC, create 2 different presentations (different disclosed claims)
- Verify both presentations resolve to same `jti` → same revocation status

#### 7.6 Verifier discovery test (`2D.6`)
- Create DID Document with `VCIndexer` service endpoint
- Resolve DID → extract endpoint → query VC status

---

## Dependency Graph

```
Phase 0 (processor generalization)
  ↓
Phase 1 (schemas) ←── can start in parallel with Phase 0
  ↓
Phase 2 (SDK VC) ←── Phase 1
  ↓
Phase 3 (anchoring + revocation) ←── Phase 2
  ↓
Phase 4 (VC Indexer) ←── Phase 0, Phase 1
  ↓
Phase 5 (VC Interface wiring) ←── Phase 2, 3, 4
  ↓
Phase 6 (forkability) ←── Phase 4, 5
  ↓
Phase 7 (testing) ←── All phases
```

**Parallel tracks after Phase 1:**
- Track A: Phase 2 → Phase 3 (SDK: issue → anchor → revoke)
- Track B: Phase 0 → Phase 4 (Indexer: generalize processor → VC config)
- Merge at Phase 5 (VC Interface wiring needs both SDK and Indexer ready)

---

## Implementation Order (Recommended)

**MVP slice first:** issue → anchor(issue) → /vc/:hash/status → revoke — validates the core loop before full selective disclosure UI.

| Step | Phase | Tasks | Est. Files | Track |
|------|-------|-------|------------|-------|
| 1a | Phase 0 | COSE shared-ize + txIndex source + processor registry + DID processor extraction + config invariant | ~7 | B |
| 1b | Phase 1 | `packages/schemas` scaffolding + schemas | ~7 | A |
| 2 | Phase 2.1 | COSE-SD utilities + `issueSDJwtVC()` | ~3 | A |
| 3 | Phase 3.1-3.4 | Anchor builders (issue, validate, revoke) | ~1 | A |
| 4 | Phase 4.1-4.2 | VC Indexer config + DB schema | ~3 | B |
| 5 | Phase 4.3-4.4 | VC processor + routes | ~3 | B |
| 6 | Phase 3.5 | `checkRevocationStatus()` (needs indexer) | ~0 | merge |
| 7 | Phase 2.2-2.4 | Presentation + verification + disclosable claims | ~1 | A |
| 8 | Phase 5.1-5.4 | Config resolver + wallet + IssuanceForm + Inbox | ~5 | merge |
| 9 | Phase 5.5-5.7 | SelectiveDisclosure + Revocation + VCIndexer svc | ~3 | merge |
| 10 | Phase 6 | Env examples + ALJ config | ~4 | — |
| 11 | Phase 7 | Test suites | ~6 | — |

**Total estimated new/modified files:** ~40

---

## Key Design Decisions

### COSE-SD Credential Format (Audit Fix #1)
- **COSE_Sign1 signing** via CIP-30 `wallet.signData()` — private keys never leave the wallet
- **SD-JWT disclosure mechanism** (salted hashes) — selective disclosure works identically to IETF SD-JWT
- **Same `payloadSig` wrapper** as DID events — verification code shared between DID and VC paths
- **Trade-off:** Not interoperable with standard SD-JWT verifiers. Acceptable for Cardano-native POC.

### VC Event Signature (Audit Fix #2, #19)
- All VC metadata events include `payloadSig: JSON.stringify({ sig, key, address })`, mirroring DID events
- All `payloadSig` fields are hex strings — `address` is hex-encoded address bytes, not bech32 (Audit Fix #7)
- Indexer verifies: COSE_Sign1 signature valid + event-type-aware signer matching (Audit Fix #19):
  - `issue` → signer matches `issuerDid`
  - `validate` → `validatorDid` required, signer matches `validatorDid`
  - `revoke` → signer validity checked at ingest; authorization (signer = canonical issuer) checked at query time by reducer (Audit Fix #20)
- Revocation authorization = signer's stake address matches canonical issuer's `issuerDid` (earliest `issue` in filtered set, ordered by `blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC`)

### Processor Registry (Audit Fix #3, #10, #11, #16)
- `EventProcessor` interface defined in **indexer app** (`apps/indexer/src/worker/types.ts`), not in packages/types
- `IndexerConfig` in packages/types stays processor-agnostic (no Drizzle/Database imports)
- `ResolvedIndexerConfig extends IndexerConfig` with `processors: Record<number, EventProcessor>` — defined in indexer app only
- DID and VC processors both plugged into same generic `processEvents()` pipeline
- Poller iterates `config.processors` entries, confirmation/reorg iterate all processors' tables
- No special-casing or branching on label values in shared code
- **Config invariant (Audit Fix #16):** `loadConfig()` asserts `processors` keys match `labels`; `schemas` derived from `processor.schema` to prevent drift

### Shared COSE Verification (Audit Fix #15)
- `verifyCoseSign1Signature()` in `packages/sdk/src/core/cose-verify.ts` — generic COSE_Sign1 decode + Ed25519 verify + stake derivation
- `verifyDIDEvent()` calls it, then compares `signerStakeAddress` to DID's stake
- `verifyVCEvent()` calls it, then performs event-type-aware matching (Audit Fix #19): `issue`→issuer, `validate`→validator, `revoke`→stores signer for query-time auth
- Zero duplicated cryptographic logic between DID and VC paths

### Config Resolution (Audit Fix #5, #14)
- `org-config.ts` = fork-time defaults (forkers edit this file)
- `resolve-config.ts` = runtime merger (`createConfig()` with env overrides)
- Overrides object built **conditionally** — only keys with defined env values are included (avoids spreading `undefined` over defaults)
- Components receive config via props/context, don't import `defaultConfig` directly in new code
- Existing component imports of `defaultConfig` replaced with resolved config at page level

### VC Event Processing (Audit Fix #19, #20)
- VC events are simpler than DID events — no chain validation (no `prev` pointer). Each event is independent.
- Validation: Zod schema check + COSE_Sign1 signature verification + event-type-aware signer matching (Audit Fix #19)
- `processEvents()` sorts by `blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC` and persists each event immediately before processing the next (Audit Fix #20)
- Revocation authorization is query-time, not ingest-time: reducer checks `revoke.signerStakeAddress === canonicalIssuer.issuerDid` stake (Audit Fix #20)
- Deterministic status reducer: `unknown` (no issue) → `active` (issued) → `revoked` (revoked by canonical issuer). See §4.3.1.
- Tie-breaking: `blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC` — chain-deterministic, survives reindexing (Audit Fix #13, #17)
- Confirmation semantics: endpoints default to confirmed-only; `?includeUnconfirmed=true` for post-submit UX (Audit Fix #9)
- Reducer is mode-independent — caller filters events before passing to reducer (Audit Fix #12)

### Indexer Table Strategy
- `vc_events` is a **separate table** (not shared with `did_events`)
- Both tables coexist in the same database — a VC Indexer config could include both `L_DID` and `L_VC` labels
- Drizzle migration is additive (new table, no DID table changes)

---

## Risk Considerations

| Risk | Mitigation |
|------|-----------|
| COSE-SD format is non-standard | Document format spec clearly; trade-off accepted for CIP-30 compatibility. Upgrade path to JWS exists. |
| Processor refactor breaks DID indexer | Phase 0 ends with DID indexer smoke test on Railway. Refactor is purely structural. |
| VC event `payloadSig` adds metadata size | Same size as DID events; well within Cardano 16KB limit |
| Claim enum drift re-emerges | Single source in `packages/schemas`; lint rule or CI check can enforce no duplicate enum definitions |
| VC Interface state complexity | Follow dashboard's proven WalletContext + service layer pattern |
| Railway deployment for VC Indexer | Same codebase, different env var — proven pattern from DID Indexer |
| DID Zod regex fix breaks validation | Phase 0.0 tightens regex; existing hex addresses pass `/^[0-9a-f]+$/i` — correctness fix, not behavior change |
| Duplicate issue events confuse status | Deterministic reducer: earliest issue in filtered set is canonical. Duplicates stored harmlessly. |
| Post-submit UX gap before confirmation | `?includeUnconfirmed=true` + "pending" badge. Verifiers see confirmed-only by default. |
| EventProcessor in packages/types breaks layering | `EventProcessor` stays in indexer app; `IndexerConfig` in packages/types is processor-agnostic. `ResolvedIndexerConfig` bridges the two. |
| resolveConfig wipes defaults with undefined | Overrides object built conditionally — only set keys included. |
| txIndex unavailable from some data sources | Column is nullable; sort falls back to `txHash ASC`. Deterministic either way, just not ledger-ordered without txIndex. |
| Config labels/processors drift silently | Startup invariant asserts match; `schemas` derived from processors. Fail-fast on misconfiguration. |

---

## Success Criteria

- [ ] Phase 0: DID Zod regex tightened to hex; COSE verification shared-ized; `MetadataEvent.txIndex` wired; `VerifyResult` contract; config invariant validates; DID Indexer works identically after processor generalization
- [ ] `issueSDJwtVC()` produces a valid COSE-SD credential with selectable disclosure
- [ ] `payloadSig.address` is hex everywhere — verification pipeline hex→bech32→stake works
- [ ] `createPresentation()` reveals only chosen claims
- [ ] `verifyPresentation()` validates COSE_Sign1 signature + checks revocation
- [ ] VC events on-chain include `payloadSig` and indexer verifies issuer authorization
- [ ] VC status reducer handles duplicate issues deterministically (earliest in filtered set = canonical)
- [ ] VC Indexer indexes L_VC events and serves all 5 REST endpoints
- [ ] `/vc/:vcHash/status` defaults to confirmed-only; `?includeUnconfirmed=true` works for post-submit UX
- [ ] VC Interface IssuanceForm issues real credentials (not mock data)
- [ ] VC Interface CredentialInbox shows credentials from indexer
- [ ] Revocation works end-to-end: revoke on-chain → indexer picks up → status changes
- [ ] `ResolvedIndexerConfig` extends `IndexerConfig` with `processors` — packages/types stays clean
- [ ] VC status reducer uses `blockHeight ASC, txIndex ASC NULLS LAST, txHash ASC` — deterministic across reindexing
- [ ] `?includeUnconfirmed=true` finds canonical issuer from unconfirmed events; default mode ignores them
- [ ] `resolveConfig()` never passes undefined into `createConfig()` — defaults preserved
- [ ] `verifyCoseSign1Signature()` is a shared SDK utility — both DID and VC verification call it (no duplicated COSE decode logic)
- [ ] Config startup invariant validates `processors` keys match `labels` array; `schemas` derived from processors
- [ ] `txIndex` column exists in `vc_events` (and optionally `did_events`); reducer sorts by `txIndex ASC NULLS LAST` before `txHash ASC`
- [ ] VC processor `verify()` is event-type-aware: `issue`→issuer, `validate`→validatorDid, `revoke`→any valid signer (auth deferred to reducer)
- [ ] `signerStakeAddress` stored in `vc_events` rows at ingest time; reducer uses it for revoke authorization without re-decoding COSE
- [ ] `processEvents()` sorts events in chain order and persists each immediately before processing the next
- [ ] `EventProcessor.verify()` returns `VerifyResult`; `processEvents()` merges with `validateChain()` into `ProcessedResult`; `makeRow()` receives `ProcessedResult` for both validity and signer context
- [ ] `MetadataEvent.txIndex` populated from Blockfrost `tx_index`; nullable for non-Blockfrost sources
- [ ] ALJ fork config deploys as separate instance
- [ ] All test suites pass
