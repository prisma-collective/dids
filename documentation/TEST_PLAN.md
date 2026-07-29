# Test Plan — Prisma DIDs

This document plans automated (Vitest) and manual/on-chain coverage for the Prisma DIDs stack: how the suite is scoped by domain, how audit findings map onto it, and where gaps remain. It covers the monorepo test inventory plus the audit-related cases developed for the security review of the on-chain interaction layer, web applications, infrastructure, and data-protection posture.

**External audit engagement:** REFAZ Security Audit Report ([PDF](./PRISMA_DIDs_Security_Audit_Report.pdf), 2026-06-25, Consolidated D1), carried out against the scope in Section 2, with findings tracked via inline annotations in commit [`84c3cff`](https://github.com/MarceloReFi/prisma-dids-audit/commit/84c3cffc82ce8af3508c8fd068cfe5fee5f1911e) and mapped to tests below.

**Deliverables produced alongside this plan:**

| Document | Purpose |
|----------|---------|
| [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md) | Manual Preprod DID lifecycle checklist (§8) |
| [`P2_VC_IMPLEMENTATION_PLAN.md`](./P2_VC_IMPLEMENTATION_PLAN.md) | Remediation tracking against §4 findings (Audit Fix #1–#25) |

---

## 1. Executive summary

The suite is organized into **functional layers** (DID identity, VC/COSE-SD, indexer ingest & status, crypto/utils) plus an **audit overlay** that adds finding-specific cases, manual Preprod procedures, and web/infra/compliance checks. Security findings use **CVSS v3.1**; data-protection findings use regulatory severities. The REFAZ engagement (June 25, 2026) exercised the audit slice; results are in Section 4.

| Layer | Packages | Role in the plan |
|-------|----------|------------------|
| SDK — identity & crypto | `packages/sdk` | DID derive/sign/verify, keys, encoding, metadata serialization |
| SDK — credentials | `packages/sdk` | COSE-SD issue/present/verify, discovery, lifecycle E2E |
| Indexer — ingest | `apps/indexer` | DID/VC processors, chain validation, poller, Blockfrost source |
| Indexer — status | `apps/indexer` | Deterministic VC status reduction |
| Audit / manual | Preprod + web/ops | Finding gates (META/SIG/IDX/WEB/CFG/DEP/DP) not fully automatable |

| Audit category | Count | Plan focus |
|----------------|-------|------------|
| MEDIUM-HIGH | 1 | F-META-01 — PII in on-chain VC signatures |
| MEDIUM | 5 | F-META-03, F-SIG-01, F-IDX-03, F-CFG-01, F-WEB-01 |
| LOW-MEDIUM | 6 | F-SIG-03, F-KEY-03, F-SIG-08, F-WEB-02/03, F-SIG-07 (resolved) |
| LOW | 5 | F-SIG-05, F-KEY-05, F-IDX-05, F-META-02 (mitigated), F-WEB-04 |
| INFO / POSITIVE | 8 + 16 | Hygiene notes; regression guards for secure patterns |
| DATA PROTECTION | 5 | DP-01–DP-05 — manual/compliance |

**Post-execution assessment:** Integrity and authentication are strong — on-chain events are cryptographically verified, DID chain rules hold, VC status reduction is deterministic, and private keys never leave the wallet.

**Remediation (2026-07):** **F-META-01**, **F-META-03**, and **F-CFG-01** are **Remediated** (minimal issue anchors, allowlisted revocation reasons, server-only `PINATA_JWT` via `POST /api/ipfs/pin`). Residual risk: **canonical JSON signing (F-SIG-01)**, **web/infra (F-WEB-\*)**, deferred revoke auth at ingest (**F-IDX-03**).

Findings — from audit, automated suites, or manual procedures — are:

1. **Verified** by Vitest where applicable.
2. **Exercised** via manual/on-chain and compliance procedures where automation is insufficient.
3. **Tracked** with explicit gaps and recommended test case IDs.

---

## 2. Scope

### In scope

| Domain | Components | Coverage |
|--------|------------|----------|
| On-chain interaction | `packages/sdk`, `packages/schemas`, `apps/indexer` | Automated suite + audit §2 / F-\* |
| Web applications | `apps/dashboard`, `apps/vc-interface` | Manual (F-WEB-\*); no Vitest app suites yet |
| Infrastructure | Dependencies, env config, Railway | `pnpm audit`, ops checks (F-DEP-\*, F-CFG-\*) |
| Data protection | On-chain metadata, IPFS, issuance | MAN-\* / DP-\* procedures |

### Out of scope

- Plutus smart contracts (metadata architecture — [ADR-001](./ADR-001_Prisma-DIDs_CIP68-vs-Metadata-v1.0.md))
- Dynamic penetration testing / fuzzing (report §5.4)
- Formal legal opinion on GDPR/LGPD compliance

### On-chain labels

| Label | Purpose |
|-------|---------|
| **199674** | DID events |
| **199675** | VC events |

---

## 3. Suite structure (plan by domain)

**Runner:** Vitest 4 · **~209 cases** across **20** `*.test.ts` files (`packages/sdk`, `apps/indexer`). No automated suites yet for dashboard / vc-interface.

### 3.1 SDK — Cryptography and identity

| File | Cases | Plan intent |
|------|------:|-------------|
| `signature.test.ts` | 9 | DID sign shape, hex payload, `ts` post-sign (F-SIG-03) |
| `verification.test.ts` | 5 | Ed25519 verify, stake mismatch, malformed sig (F-KEY-02, F-SIG-04) |
| `keys.test.ts` | 6 | Multibase convert/validate (F-KEY-06; F-KEY-03 partial) |
| `encoding.test.ts` | 8 | Hex/UTF-8 round-trip, concat |
| `stake.test.ts` | 3 | Base→stake derivation, invalid input |
| `did.test.ts` | 9 | `deriveDID`, DID Document + VCIndexer services |
| `payload.test.ts` | 6 | create/update/revoke payloads, version monotonicity |
| `metadata.test.ts` | 10 | 64-char chunking, 16 KB limit, L_DID wrap (F-META-08) |

### 3.2 SDK — Verifiable credentials

| File | Cases | Plan intent |
|------|------:|-------------|
| `vc.test.ts` | 18 | COSE-SD issue, disclosures, presentations, schema gates (F-META-01 path) |
| `vc-verify.test.ts` | 20 | Present→verify E2E, payload binding, jti, revocation (F-SIG-05, F-IDX-06) |
| `vc-discovery.test.ts` | 4 | VCIndexer service endpoint resolution |
| `did-lifecycle.e2e.test.ts` | 8 | Create→update→revoke SDK path; schemas (F-META-07, F-SIG-03) |

### 3.3 Indexer — Ingest and chain

| File | Cases | Plan intent |
|------|------:|-------------|
| `did-processor.test.ts` | 17 | DID schema, row mapping, invalid verification |
| `vc-processor.test.ts` | 29 | VC schema, reason enum, `jsonPayloadMatch`, issue anchor binding (F-IDX-01/03/05, F-META-03) |
| `chain-validator.test.ts` | 8 | Create/update rules, duplicates, forks (F-IDX-02, F-META-02) |
| `did-lifecycle.e2e.test.ts` | 12 | Happy/reject/dedup/chain edge batches (F-IDX-02) |
| `metadata.test.ts` | 10 | Unchunk / reconstruct (F-META-08) |
| `poller.test.ts` | 6 | Crash recovery, incremental poll (F-IDX-04) |
| `blockfrost.test.ts` | 7 | Tip/block/label fetch, 429/500 retry |

### 3.4 Indexer — VC status

| File | Cases | Plan intent |
|------|------:|-------------|
| `vc-status-reducer.test.ts` | 14 | Status machine, unauthorized revoke ignore, ordering (F-IDX-06/03, F-META-02) |

### 3.5 Planned gaps (suite-level)

| Gap | Rationale |
|-----|-----------|
| App-level Vitest (dashboard / vc-interface) | Web findings (F-WEB-\*) remain manual |
| JCS / `stableSort` edge suite | F-SIG-01 — SIG-01-D/E recommended |
| `extractRawPublicKey` malformation cases | F-KEY-03 — KEY-03-E/F recommended |
| Schema `.strict()` unknown-field rejection | F-SIG-08 — SIG-08-C/D recommended |
| Address validation before `signData` | F-KEY-05 — KEY-05-A recommended |

---

## 4. Complete findings register

### 4.1 Security findings requiring test coverage

| ID | Severity | CVSS | Status | Location | Summary |
|----|----------|------|--------|----------|---------|
| **F-META-01** | **MEDIUM-HIGH** | 5.2 | **Remediated** | `vcService.ts`, `vc-anchor.ts`; 199675 | Minimal anchor fields only; claims IPFS-only; indexer legacy fallback for historical preprod |
| **F-META-03** | MEDIUM | 3.7 | **Remediated** | `vc-event.ts`, `vc-anchor.ts`, `RevocationUI.tsx` | `reason` ∈ `RevocationReasonEnum` |
| **F-SIG-01** | MEDIUM | 2.1 | Open | `vc-anchor.ts`, `signature.ts` | `JSON.stringify` / `stableSort` ≠ full RFC 8785 JCS |
| **F-IDX-03** | MEDIUM | 3.7 | Open (trade-off) | `vc-processor.ts`, `vc.ts` | Unauthorized revokes stored at ingest; auth at query time |
| **F-CFG-01** | MEDIUM | — | **Remediated** | `POST /api/ipfs/pin`, `PINATA_JWT` | Pinata write server-only; Blockfrost still `NEXT_PUBLIC_` (review separately) |
| **F-WEB-01** | MEDIUM | — | Open | `next.config.js` (both apps) | Missing security headers / CSP |
| **F-SIG-03** | LOW-MEDIUM | 1.3 | Accepted | `signature.ts` | DID `ts` appended after signing |
| **F-KEY-03** | LOW-MEDIUM | 2.7 | Open | `keys.ts` | `extractRawPublicKey` byte-scan + silent 32-byte fallback |
| **F-SIG-08** | LOW-MEDIUM | 3.7 | Open | `vc-event.ts` | `.passthrough()` allows unknown fields |
| **F-WEB-02** | LOW-MEDIUM | — | Open | vc-interface credentials | Presentation in URL query |
| **F-WEB-03** | LOW-MEDIUM | — | Open | `credentialStore.ts` | Credentials unencrypted in `localStorage` |
| **F-SIG-05** | LOW | — | Mitigated | `vc-verify.ts` | Non-canonical SDK verify; indexer mitigates |
| **F-KEY-05** | LOW | — | Open | `signature.ts`, `vc-anchor.ts` | No address validation before `signData` |
| **F-IDX-05** | LOW | — | **Remediated** | `vc-processor.ts` | Issue requires anchor binding; legacy credential payloads for historical txs only |
| **F-META-02** | LOW | — | **Mitigated** | Indexer | Duplicates handled by chain validator + status reducer |
| **F-WEB-04** | LOW | — | Open | API routes | No rate / body-size limits on public verify & DID proxy |
| **F-SIG-07** | INFO | — | **Resolved** | Schema/SDK | `ipfsCid` optional; SDK populates on issue path |

### 4.2 Positive findings (regression guards)

| ID | Area | Finding | Primary tests |
|----|------|---------|---------------|
| F-KEY-01 | Keys | Private keys never in SDK; CIP-30 only | Architecture; no key material in SDK bundle |
| F-KEY-02 | Crypto | `@noble/ed25519` async, audited | `verification.test.ts`, `vc-verify.test.ts` |
| F-SIG-04 | Crypto | COSE_Sign1 RFC 8152 | `cose-verify` in verification paths |
| F-IDX-01 | Indexer | Order-independent `jsonPayloadMatch()` | `vc-processor.test.ts` |
| F-IDX-02 | Indexer | DID chain (fork, version, dupes) | `chain-validator.test.ts`, `did-lifecycle.e2e.test.ts` |
| F-IDX-04 | Indexer | Poller reorg / crash recovery | `poller.test.ts` |
| F-IDX-06 | Indexer | Deterministic VC status reducer | `vc-status-reducer.test.ts` |
| F-KEY-06 | Keys | Multibase spec-compliant | `keys.test.ts` |
| F-META-07 | Metadata | DID path: CID-only on-chain | `metadata.test.ts`, `did-lifecycle.e2e.test.ts` |
| F-META-08 | Metadata | 64-byte chunking | `metadata.test.ts` |
| F-DEP-03/04 | Deps | Crypto clean; no Critical on prod surface | `pnpm audit` / `--prod` |
| F-CFG-02 | Config | No committed secrets | Repo hygiene |
| F-WEB-P1–P3 | Web | No XSS sinks; i18n allowlist; wallet-signed mutations | Static / architecture review |

### 4.3 Data-protection findings

| ID | DP severity | Technical correlate | GDPR | Test approach |
|----|-------------|---------------------|------|---------------|
| **DP-01** | High | F-META-01 | Art. 4, 5(1)(c), 17, 25 | MAN-01, META-01-\* |
| **DP-02** | High | F-META-03 | Art. 5(1)(c), 9, 17 | MAN-03, META-03-\* |
| **DP-03** | Medium | F-META-06 | Art. 4(5), Recital 26 | Privacy notice review |
| **DP-04** | Medium | F-CFG-01 | Art. 28, 44–49 | Pinata DPA + SCCs |
| **DP-05** | Medium | (new) | Art. 12–22, 35 | DPIA, subject-rights channel |

---

## 5. Empirical on-chain evidence (Preprod)

Gathered during plan execution (audit report §5.2) — use for manual regression.

| Label | Tx hash | Finding | Expected outcome |
|-------|---------|---------|------------------|
| 199674 | `2c641e25…fa70730` | F-IDX-02 / F-META-02 | Second create → `duplicate_create` |
| 199674 | `cf11b0ee…12a6074d` | F-META-02 | Duplicate DID create (pair) |
| 199675 | `e856e6bd…b1fd99e0` | F-META-01 / DP-01 | Pre-fix: claims + `evidenceUrl` in COSE (31 chunks) |
| 199675 | `114d72…cc16` | F-IDX-06 / F-META-02 | Canonical revoke `issued_in_error` for `urn:uuid:53ca5da9-…` |
| 199675 | `19d65de…fdee`, `13c6d04…f25cc` | F-META-02 | Duplicate revokes — reducer picks earliest authorized |

**F-META-01 decoded payload (report evidence, pre-fix):**

```json
{
  "projectId": "Alfred Project",
  "contributionType": "mentorship",
  "hours": 10,
  "organization": "Alfred Project",
  "evidenceUrl": "https://app.zoom.us/wc/.../join?...pwd=...",
  "iss": "did:cardano:stake_test1uzcsa2dkz...",
  "sub": "did:cardano:stake_test1uz0nz5vu2j...",
  "vct": "ContributionCredential",
  "_sd": ["Ty0pju67IBQFiLl1mPxZUjBWjRqNhyxCheexZ-1yPlY"]
}
```

---

## 6. Test execution

### Automated

```bash
pnpm test                              # Full monorepo
pnpm --filter @prisma-events/dids-sdk test
pnpm --filter @prisma-events/dids-indexer test
pnpm type-check
pnpm audit                             # F-DEP-01
pnpm audit --prod                      # F-DEP-04
```

### Manual

- [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md) — DID update/revoke on Preprod
- §8 — audit-specific and web/infrastructure procedures

---

## 7. Finding → test coverage matrix

Legend: ✅ Covered · ⚠️ Partial · ❌ Gap · 🔵 Positive (regression)

### F-META-01 / DP-01 — PII in on-chain VC signatures (P0) — **Remediated**

Issue signs `{event, issuerDid, holderDid, vcHash, vcType, vcFormat, ts}` only; claims on IPFS. Indexer binds minimal anchor (legacy credential payloads for historical preprod).

| ID | Type | Procedure | Status |
|----|------|-----------|--------|
| META-01-A | Auto | `vc.test.ts` — COSE-SD `payloadSig` | ✅ |
| META-01-B | Auto | `vc-processor.test.ts` — issue schema + anchor binding | ✅ |
| META-01-C/D | Manual | Preprod decode 199675; no claims in signed COSE | ✅ |
| META-01-E | Unit | Minimal field set on issue path | ✅ |
| META-01-F | Unit | Metadata size with long claim URLs | ⚠️ (`metadata.test.ts`) |

**Pass:** On-chain anchor = minimal fields (+ optional unsigned `ipfsCid`); credential IPFS-only.

### F-META-03 / DP-02 — Revocation `reason` enum (P1) — **Remediated**

Allowlist only (`issued_in_error`, `holder_request`, `policy_violation`, `expired`, `compromised`, `withdrawn_by_holder`).

| ID | Type | Procedure | Status |
|----|------|-----------|--------|
| META-03-A/E/F | Schema | Reject free-text; enum short | ✅ |
| META-03-B | Auto | `vc-processor.test.ts` — persist allowlisted reason | ✅ |
| META-03-C | Auto | `vc-status-reducer.test.ts` — reason from authorized revoke | ✅ |
| META-03-D | Manual | Free-text revoke rejected client/SDK | ✅ |

### F-SIG-01 — Non-canonical JSON signing (P3)

| ID | Type | Procedure | Status |
|----|------|-----------|--------|
| SIG-01-A | Auto | `jsonPayloadMatch` key-order | ✅ |
| SIG-01-B | Auto | `vc-verify.test.ts` payload binding | ✅ |
| SIG-01-C | Auto | `vc.test.ts` COSE-SD issuance | ⚠️ |
| SIG-01-D/E | Unit | `stableSort` vs JCS; `computeEd25519VcHash` | ❌ |

*Mitigation:* Indexer `jsonPayloadMatch()` (F-IDX-01).

### F-IDX-03 — Deferred revoke authorization (P2)

| ID | Type | Procedure | Status |
|----|------|-----------|--------|
| IDX-03-A/B | Auto | Unauthorized revoke ignored; issue→validate→bad→good revoke | ✅ |
| IDX-03-C | Auto | Revoke row stored at ingest | ⚠️ |
| IDX-03-D/E/H | Manual/Int | Status stays active; ingest `valid=true`; rate limit | ❌ |

### Other open / mitigated findings

| Finding | Covered | Gaps |
|---------|---------|------|
| **F-IDX-05** Remediated | IDX-05-A/B — issue anchor + legacy fallback ✅ | — |
| **F-META-02** Mitigated | META-02-A–D — dup create/revoke + Preprod ✅ | — |
| **F-SIG-03** Accepted | SIG-03-A–C (`signature`, lifecycle E2E) ✅ | SIG-03-D tamper `ts` ❌ |
| **F-SIG-08** | Required fields / unknown event ✅ | Extra field passthrough; `.strict()` ❌ |
| **F-KEY-03** | Multibase / verify paths ⚠️ | Malformed CBOR throw; cborg `-2` ❌ |
| **F-SIG-05** Mitigated | `vc-verify` + `jsonPayloadMatch` ✅ | — |
| **F-KEY-05** | Valid test address only ⚠️ | Reject invalid bech32 before `signData` ❌ |
| **F-CFG-01** Remediated | Bundle grep; `/api/ipfs/pin`; server `PINATA_JWT` ✅ | — |
| **F-WEB-01** | — | `curl -I` CSP/HSTS/etc.; `headers()` in next.config ❌ |
| **F-WEB-02** | — | Query vs fragment share link; log exposure ❌ |
| **F-WEB-03** | — | localStorage plaintext; clear-data control ❌ |
| **F-WEB-04** | — | Flood verify; oversized body; DID proxy allowlist ❌ |
| **F-DEP-01** | — | CI `pnpm audit` / `--prod`; post-update re-audit ❌ |

### Positive findings — regression guards

| Finding | Key tests |
|---------|-----------|
| F-IDX-01 | `vc-processor.test.ts` — `jsonPayloadMatch` |
| F-IDX-02 | `chain-validator.test.ts`, indexer `did-lifecycle.e2e.test.ts` |
| F-IDX-04 | `poller.test.ts` |
| F-IDX-06 | `vc-status-reducer.test.ts`, `vc-verify.test.ts` |
| F-META-07/08 | SDK + indexer `metadata.test.ts`, lifecycle E2E |
| F-KEY-02/06 | `verification.test.ts`, `keys.test.ts` |

---

## 8. Manual test procedures

### MAN-01 — On-chain metadata privacy (F-META-01 / DP-01)

1. Issue `ContributionCredential` with distinctive `evidenceUrl` secret.
2. Confirm Preprod tx; inspect label **199675**; decode `payloadSig`.
3. **Pass (post-fix):** Only minimal anchor fields; claims absent from chain.

### MAN-02 — Duplicate DID create (F-IDX-02 / F-META-02)

Create DID (v=1), submit second `create` for same stake → `valid: false`, `duplicate_create`.

### MAN-03 — Unauthorized revocation (F-IDX-06 / F-IDX-03 / DP-02)

1. Issue as Issuer A; revoke from Wallet B with allowlisted reason (free-text must fail schema/UI).
2. `GET /vc/{vcHash}/status` → `active`; unauthorized row may exist in DB.
3. Authorized revoke from A → `revoked`; `revokedTxHash` is A's tx.

### MAN-04 — DID lifecycle (F-IDX-02)

Follow [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md) C.3–C.4.

### MAN-05 — Metadata 16 KB limit (F-META-08)

Payload approaching 16 KB → SDK throws before submit (`metadata.test.ts` covers serialization).

### MAN-06 — Security headers (F-WEB-01)

```bash
curl -I https://<dashboard-host>/
curl -I https://<vc-interface-host>/
```

Expect: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.

### MAN-07 — Client bundle secrets (F-CFG-01)

Build production bundles; search for Pinata JWT. **Pass:** no write-capable Pinata credentials in client JS.

### MAN-08 — Presentation URL leakage (F-WEB-02)

Share link: query (`?p=`) vs fragment (`#p=`); check proxy/server logs for query persistence. Also covers localStorage exposure path for F-WEB-03.

### MAN-09 — Data-protection compliance (DP-03–DP-05)

| Check | Procedure |
|-------|-----------|
| DP-03 | Privacy notice: DIDs as pseudonymised personal data |
| DP-04 | Pinata DPA + EU SCCs before production |
| DP-05 | Subject-request channel; DPIA; immutability warning at issuance |

---

## 9. Remediation priority matrix (§5.3 of audit results)

| Prio | Finding | Effort | Test gate | Status |
|------|---------|--------|-----------|--------|
| **P0** | F-META-01 / DP-01 — minimal anchor | 2–4 h | MAN-01, META-01-E/F | **Done** |
| **P1** | F-META-03 / DP-02 — reason enum | 30 min | META-03-E/F | **Done** |
| **P2** | F-IDX-03 — ingest reject + rate limit | 1 h | IDX-03-E/H | Open |
| **P3** | F-SIG-01 — JCS / stableSort | 1 h | SIG-01-D/E | Open |
| **P4** | F-KEY-03 — cborg.decode() COSE_Key | 1 h | KEY-03-E/F | Open |
| **P5** | F-SIG-03 — sign DID ts | 15 min | SIG-03-D | Accepted |
| **P6** | F-DEP-01 — dependency update | 1 h | DEP-01-A/B | Open |
| **P7** | F-CFG-01 — Pinata server-side | 1–2 h | CFG-01-A/B | **Done** |
| **P8** | DP-04 — Pinata DPA + SCCs | Legal | MAN-09 | Open |
| **P9** | DP-05 — subject-rights + DPIA | 1 day | MAN-09 | Open |
| **P10** | F-KEY-05 — address validation | 15 min | KEY-05-A | Open |

---

## 10. Release regression checklist

### Automated (every release)

- [ ] `pnpm test` — all 20 files green (~209 cases)
- [ ] `pnpm type-check`
- [ ] `pnpm audit --prod` — zero Critical (F-DEP-04)
- [ ] F-IDX-02: `chain-validator` + indexer `did-lifecycle.e2e`
- [ ] F-IDX-06: `vc-status-reducer` unauthorized revoke
- [ ] F-IDX-01: `jsonPayloadMatch` key-order
- [ ] COSE: `vc-verify.test.ts` + `verification.test.ts`

### Manual (when affected code changes)

| Change area | Manual tests |
|-------------|--------------|
| VC anchoring / SDK issue | MAN-01 |
| DID lifecycle | MAN-04 |
| Revoke authorization | MAN-03 |
| Next.js apps | MAN-06, MAN-07, MAN-08 |
| Dependencies | DEP-01-C |
| Pre-production launch | MAN-09 |

---

## 11. Traceability index

| Finding | Severity | Automated | Manual |
|---------|----------|-----------|--------|
| F-META-01 / DP-01 | MEDIUM-HIGH | **Remediated** — `vc-processor`, issue path | MAN-01 |
| F-META-03 / DP-02 | MEDIUM | **Remediated** — schema enum + UI | MAN-03 |
| F-META-02 | LOW (mitigated) | `chain-validator`, `vc-status-reducer` | MAN-02 |
| F-SIG-01 | MEDIUM | `vc-processor`, `vc-verify` | — |
| F-SIG-03 | LOW-MEDIUM | `signature`, lifecycle E2E | MAN-04 |
| F-SIG-05 | LOW | `vc-verify` | — |
| F-SIG-08 | LOW-MEDIUM | `vc-processor` | — |
| F-KEY-03 | LOW-MEDIUM | `keys` (partial) | — |
| F-KEY-05 | LOW | — | — |
| F-IDX-01 | POSITIVE | `vc-processor` | — |
| F-IDX-02 | POSITIVE | `chain-validator`, lifecycle E2E | MAN-02, MAN-04 |
| F-IDX-03 | MEDIUM | `vc-status-reducer` | MAN-03 |
| F-IDX-04 | POSITIVE | `poller` | — |
| F-IDX-05 | LOW | **Remediated** — `vc-processor` | — |
| F-IDX-06 | POSITIVE | `vc-status-reducer`, `vc-verify` | MAN-03 |
| F-CFG-01 | MEDIUM | **Remediated** — `/api/ipfs/pin` | MAN-07 |
| F-WEB-01–04 | MED–LOW | — | MAN-06–08 |
| F-DEP-01 | MEDIUM | — | DEP-01-\* |
| DP-03–05 | Medium | — | MAN-09 |

---

*This plan covers the Vitest suite (~209 cases / 20 files) and governed the REFAZ Security Audit Report (2026-06-25, commit `84c3cffc82ce8af3508c8fd068cfe5fee5f1911e`). Kept in sync with remediations as of 2026-07-29 (F-META-01, F-META-03, F-CFG-01, F-IDX-05 closed in code).*
