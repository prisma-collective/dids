# P1: Configurable Indexer + DID Config — Implementation Plan

## Context

The P0 DID layer is complete (SDK, Dashboard, types), but the Dashboard currently queries Blockfrost directly for every DID resolution — slow, rate-limited, and unscalable. P1 builds the indexer: a backend service that continuously scans Cardano metadata, stores validated DID events in PostgreSQL, and exposes a fast REST API. The same codebase will later be deployed as a VC Indexer (P2b) via config swap.

**8 POC_PLAN tasks** (lines 215-238): config system, PostgreSQL schema, polling worker, REST API, DID config, dashboard wiring, remove `apps/api` stub, deploy to Railway.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| HTTP | **Fastify 5** | Fast, TypeScript-native, built-in JSON schema validation, Pino logger |
| ORM | **Drizzle ORM** | Lightweight, type-safe queries, migration generation, minimal overhead |
| DB | **PostgreSQL** (via `pg`) | Spec requirement (TECHNICAL_DESIGN §9.2) |
| Worker | `setInterval` polling | POC-appropriate; webhooks can be added later |
| Dev | `tsx watch` | Fast TypeScript execution for dev mode |
| Test | **Vitest** | Fast, TypeScript-native, already in ecosystem |

---

## File Structure

```
apps/indexer/
├── package.json                  # Fastify, Drizzle, pg, zod, SDK deps
├── tsconfig.json
├── drizzle.config.ts             # Drizzle Kit config
├── .env.example
├── Dockerfile                    # Railway deployment
├── src/
│   ├── index.ts                  # Entrypoint: load config → DB → server → poller
│   ├── config/
│   │   ├── types.ts              # Re-export IndexerConfig from types pkg
│   │   ├── did-indexer.ts        # DID config: L_DID=199674, did_events, DID routes
│   │   └── load-config.ts        # Dynamic config loader (INDEXER_CONFIG env var)
│   ├── db/
│   │   ├── schema.ts             # Drizzle tables: did_events, sync_state
│   │   ├── connection.ts         # pg Pool + Drizzle client from DATABASE_URL
│   │   └── migrate.ts            # Auto-run migrations on startup
│   ├── sources/
│   │   ├── types.ts              # MetadataSource interface (swap Blockfrost → Oura later)
│   │   └── blockfrost.ts         # BlockfrostSource: listLabelEvents, getBlockByHeight
│   ├── worker/
│   │   ├── poller.ts             # Polling via MetadataSource (incremental, rollback detection)
│   │   ├── processor.ts          # Validate events (Zod + sig + chain) → batch INSERT
│   │   ├── chain-validator.ts    # DID chain validation (prev linkage, version, fork detection)
│   │   └── metadata.ts           # Unchunk strings, restore nulls (from dashboard)
│   ├── api/
│   │   ├── server.ts             # Fastify factory: CORS, health, config-driven routes
│   │   └── routes/
│   │       ├── did.ts            # GET /did/:did, GET /did/:did/history
│   │       └── universal.ts      # GET /1.0/identifiers/:did (W3C Universal Resolver)
│   └── services/
│       └── did-resolver.ts       # DB queries + IPFS doc fetch for DID resolution
└── drizzle/                      # Generated migration SQL
```

---

## Implementation Phases (10 phases, 29 steps)

### Phase 1: Foundation
1. Add `IndexerConfig` + `EndpointConfig` types to [config.ts](packages/types/src/config.ts)
2. Rewrite [package.json](apps/indexer/package.json) with real deps (Fastify, Drizzle, pg, SDK)
3. Update [tsconfig.json](apps/indexer/tsconfig.json), create `.env.example`

### Phase 2: Database Layer
4. Create `src/db/schema.ts` — `did_events` table (per §9.2) + `sync_state` checkpoint table + composite indexes
5. Create `src/db/connection.ts` — Drizzle client factory
6. Create `src/db/migrate.ts` — versioned migration runner (uses `drizzle-kit generate` SQL files, NOT `push`)
7. Create `drizzle.config.ts`
8. Run `drizzle-kit generate` to produce versioned SQL migration in `drizzle/`

### Phase 3: Config System
9. Create `src/config/did-indexer.ts` — L_DID=199674, DID endpoints, DIDEventSchema
10. Create `src/config/load-config.ts` — reads `INDEXER_CONFIG` env var

### Phase 4: MetadataSource + Polling Worker
11. Create `src/sources/types.ts` — `MetadataSource` interface: `listLabelEvents(label, order, page, count)`, `getBlockByHeight(height)`
12. Create `src/sources/blockfrost.ts` — `BlockfrostSource` implementing MetadataSource (HTTP keep-alive, retry/backoff for 429/5xx)
13. Create `src/worker/metadata.ts` — extract unchunk/reconstruct logic from [route.ts](apps/dashboard/app/api/did/[did]/route.ts)
14. Create `src/worker/chain-validator.ts` — DID chain validation (prev linkage, version monotonicity, fork detection)
15. Create `src/worker/processor.ts` — Zod validate → `verifyDIDEvent()` → `validateDIDChain()` → batch INSERT with dedup
16. Create `src/worker/poller.ts` — block-height boundary incremental polling, rollback detection, asc initial sync, crash-safe checkpointing

### Phase 5: REST API
17. Create `src/services/did-resolver.ts` — resolve DID (latest valid+confirmed event + IPFS doc), history with pagination
18. Create `src/api/routes/did.ts` — GET `/did/:did`, GET `/did/:did/history` (filter confirmed by default, `?includeUnconfirmed=true` opt-in)
19. Create `src/api/routes/universal.ts` — GET `/1.0/identifiers/:did` (W3C DID Resolution Result format)
20. Create `src/api/server.ts` — Fastify factory with CORS, health, Cache-Control headers, config-driven route registration

### Phase 6: Entrypoint
21. Replace `src/index.ts` stub — wire: loadConfig → DB → migrate → server.listen → poller.start

### Phase 7: Dashboard Wiring
22. Rewrite [route.ts](apps/dashboard/app/api/did/[did]/route.ts) — proxy to indexer, normalize response to `{ latest: DIDEventRecord }` / `{ events: DIDEventRecord[] }` contract
23. `didService.ts` stays unchanged (calls same `/api/did/:did` path)

### Phase 8: Cleanup
24. Delete `apps/api/` directory entirely
25. Update POC_PLAN.md checkboxes and progress table

### Phase 9: Dockerfile
26. Multi-stage Docker build for Railway deployment

### Phase 10: Tests + Smoke Test
27. Write unit tests (metadata, chain-validator, processor, blockfrost-source)
28. Write integration tests (API routes via Fastify inject, resolver service, universal resolver endpoint)
29. Manual E2E: PostgreSQL → indexer dev → dashboard → verify full flow

---

## Key Design Decisions

### Config-driven architecture
- `IndexerConfig` specifies: labels to index, DB table, Zod schemas, API endpoints
- Same code deployed as DID Indexer (`INDEXER_CONFIG=did`) or VC Indexer (`INDEXER_CONFIG=vc`)
- Route handlers registered via `handlerId` lookup — config lists which routes are active

### Network isolation
- **One deployment per network** (preprod now, mainnet later)
- Config specifies `network: 'preprod' | 'mainnet'`, each instance has its own DB
- No network column needed in tables — the entire DB is network-scoped
- Dashboard uses **per-network env vars**: `INDEXER_URL_PREPROD` and `INDEXER_URL_MAINNET`
- Proxy reads `network` query param from request and selects the correct indexer URL
- For now only `INDEXER_URL_PREPROD` is required; `INDEXER_URL_MAINNET` falls back to error if unset

### MetadataSource interface (swappable data ingestion)
- Clean abstraction boundary: `MetadataSource` interface with `listLabelEvents(label, order, page, count)` and `getBlockByHeight(height)`
- Only `BlockfrostSource` implemented now; add `OuraWebhookSource` or `KoiosSource` later without changing processing/storage/API
- **Upgrade path:** Blockfrost polling (POC) → Demeter.run managed Oura (early prod) → Self-hosted Oura (scale prod)
- BlockfrostSource includes HTTP keep-alive and retry/backoff for 429/5xx responses

### Polling strategy (block-height boundary, O(new_events) per cycle)
- `sync_state` tracks `last_block_height` and `last_block_hash` per label
- **Incremental polling:** use `order=desc` (newest first), fetch pages and process all events where `block_height > last_block_height`. For events at `block_height == last_block_height`, re-insert idempotently (dedup via tx_hash UNIQUE). Stop when `block_height < last_block_height`. This avoids relying on tx_hash ordering within a block.
- **Initial sync (empty DB):** `last_block_height` is 0, so all events qualify. Page through with `order=asc` once to process chronologically, then switch to desc-first for subsequent polls.
- `tx_hash` UNIQUE constraint + `onConflictDoNothing` = idempotent inserts (safe on crash/restart — replaying the checkpoint block is harmless)
- **Batch insert:** process each Blockfrost page as a single `INSERT ... ON CONFLICT DO NOTHING` batch, not row-by-row
- **Crash safety:** checkpoint is updated only AFTER all events in a block are fully processed. On restart, the last partial block is re-processed idempotently.
- Mutex flag prevents overlapping polls

### Rollback detection
- `sync_state` stores `last_block_hash` alongside `last_block_height`
- On each poll start, call `getBlockByHeight(last_block_height)` via MetadataSource and compare returned block hash against stored `last_block_hash`
- **If mismatch (chain reorg detected):** mark all events at or above that block_height as stale (`valid=false`, `validation_error='reorg_invalidated'`), reset checkpoint to the last confirmed height, re-process from there
- For POC on preprod, reorgs are rare but the mechanism must exist for mainnet safety

### Confirmation depth (per NeoPRISM's 112-block standard)
- `CONFIRMATION_DEPTH` env var: default **112** for mainnet, **10** for preprod (faster dev UX)
- Events are stored with `confirmed=false` initially
- On each poll cycle, after processing new events, run a confirmation pass: mark events as `confirmed=true` where `current_chain_tip - block_height >= CONFIRMATION_DEPTH`
- **Resolution returns only confirmed events by default**; opt-in `?includeUnconfirmed=true` query param for recent events
- `confirmed_at_height` column records the chain tip height at which the event was confirmed

### Verification pipeline (signature + chain validation)
- **Step 1 — Schema:** Reconstruct metadata → Zod schema validate
- **Step 2 — Signature:** `verifyDIDEvent()` (Ed25519 sig + controller match)
- **Step 3 — Chain:** `validateDIDChain()` checks:
  - `create` must be v=1, prev=null, and no prior create exists for this DID
  - `update`/`revoke` must have prev pointing to a known, **valid** tx_hash in did_events **for the same DID**
  - Version must be strictly greater than the previous event's version for that DID
  - No forks: two events for the same DID cannot share the same prev_tx_hash
- Invalid events stored with `valid=false` + `validation_error` column for diagnostics
- Resolution queries filter to `valid=true` only

### Dashboard integration (contract-preserving proxy)
- Thin proxy approach: dashboard's Next.js API route forwards to indexer
- **The proxy normalizes indexer responses to match the existing contract** that `didService.ts` expects:
  - `GET /api/did/:did?network=preprod` → `{ latest: DIDEventRecord | null }` (unchanged)
  - `GET /api/did/:did?network=preprod&history=true` → `{ events: DIDEventRecord[] }` (unchanged)
- The `DIDEventRecord` shape (`{ txHash, event: DIDEvent, blockHeight, timestamp }`) is preserved
- `didService.ts` unchanged — same `/api/did/:did` interface
- Dashboard env vars: `INDEXER_URL_PREPROD` (required), `INDEXER_URL_MAINNET` (optional, errors if unset and requested)
- Proxy reads `network` query param → selects `INDEXER_URL_{NETWORK}` → forwards request

---

## Database Schema

### did_events (per TECHNICAL_DESIGN §9.2)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| did | TEXT | Indexed (see composite indexes below) |
| tx_hash | TEXT (UNIQUE) | Dedup key |
| action | TEXT | create/update/revoke |
| version | INTEGER | Event version |
| prev_tx_hash | TEXT | Chain linkage |
| ipfs_cid | TEXT | DID Document CID |
| valid | BOOLEAN | Verification result (sig + chain) |
| validation_error | TEXT | Null if valid; reason string if invalid (e.g. "bad_signature", "broken_chain", "schema_invalid", "reorg_invalidated") |
| confirmed | BOOLEAN | False until block_height is CONFIRMATION_DEPTH behind chain tip |
| confirmed_at_height | BIGINT | Chain tip height when event was confirmed (null if unconfirmed) |
| block_height | BIGINT | Indexed |
| timestamp | TIMESTAMPTZ | Block time |
| raw_event | TEXT | Original JSON for replay |
| created_at | TIMESTAMPTZ | Row insertion time |

**Indexes:**
- `idx_did_valid_confirmed_version` — partial index on `(did, version DESC) WHERE valid=true AND confirmed=true` — resolver hot path
- `idx_did_version` on `(did, version)` — history queries
- `idx_block_height` on `(block_height)` — polling checkpoint + confirmation pass
- `idx_confirmed` on `(confirmed) WHERE confirmed=false` — confirmation pass scan

### sync_state
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| label | INTEGER (UNIQUE) | Metadata label (199674) |
| last_block_height | BIGINT | Polling checkpoint |
| last_block_hash | TEXT | Block hash at checkpoint height — used for rollback detection |
| last_tx_hash | TEXT | Diagnostic only: last tx seen at checkpoint height. Not used in boundary logic. |
| updated_at | TIMESTAMPTZ | Last poll time |

---

## REST API (per TECHNICAL_DESIGN §9.3)

| Endpoint | Response |
|----------|----------|
| `GET /did/:did` | `{ did, document, metadata: { created, updated, version, deactivated } }` |
| `GET /did/:did/history?limit=50&offset=0&order=desc` | `{ did, events: [...], total, limit, offset }` |
| `GET /1.0/identifiers/:did` | W3C DID Resolution Result: `{ didResolutionMetadata, didDocument, didDocumentMetadata }` |
| `GET /health` | `{ status, indexer, network, confirmationDepth, sync: [{ label, lastBlockHeight, lastBlockHash }] }` |

- 404 for unknown DID, 410 for revoked DID.
- Query params: `?includeUnconfirmed=true` to include events within confirmation window.
- **HTTP caching:** `Cache-Control: max-age=60` on resolved DIDs, `max-age=86400, immutable` on revoked DIDs. `ETag` based on latest event's `tx_hash`.
- IPFS document fetch only on `/did/:did` and `/1.0/identifiers/:did` (not on `/history`).

---

## Files Modified Outside Indexer

| File | Change |
|------|--------|
| `packages/types/src/config.ts` | Add `IndexerConfig`, `EndpointConfig` interfaces |
| `apps/dashboard/app/api/did/[did]/route.ts` | Rewrite: proxy to indexer API |
| `apps/api/` (entire directory) | **Delete** |
| `documentation/POC_PLAN.md` | Update checkboxes + progress table |

---

## Verification

### Unit/Integration Tests (Vitest)
| Test file | What it covers |
|-----------|----------------|
| `metadata.test.ts` | Unchunking 64-byte strings, null restoration, nested reconstruction |
| `chain-validator.test.ts` | Valid chain, broken prev, version gap, fork detection, double-create |
| `processor.test.ts` | Valid insert, schema rejection, sig failure, dedup via tx_hash conflict |
| `did-resolver.test.ts` | Latest valid event, revoked DID returns deactivated, IPFS fetch timeout handling |
| `did-routes.test.ts` | Fastify `.inject()`: 200/404/410 responses, pagination params, contract shape matches `DIDEventRecord` |
| `poller.test.ts` | Checkpoint resume, initial sync vs incremental, crash-safe block replay |

### Manual E2E Smoke Test
1. `docker run -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:16`
2. `DATABASE_URL=postgresql://postgres:test@localhost:5432/postgres BLOCKFROST_API_KEY=preprod... pnpm --filter @prisma-dids/indexer dev`
3. `curl localhost:3001/health` → verify sync state, network=preprod
4. Wait ~30s for first poll cycle to complete
5. `curl localhost:3001/did/did:cardano:stake_test1...` → verify DID document + metadata
6. `curl localhost:3001/did/did:cardano:stake_test1.../history` → verify event chain + pagination
7. `curl localhost:3001/did/nonexistent` → verify 404
8. Stop and restart indexer → verify checkpoint resumes (no reprocessing old events)
9. Start dashboard: `INDEXER_URL_PREPROD=http://localhost:3001 pnpm --filter @prisma-dids/dashboard dev`
10. Connect wallet → verify DID status displays correctly (same as before)
