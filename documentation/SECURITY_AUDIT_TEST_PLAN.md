# Security Audit Test Plan — Prisma DIDs

Comprehensive test plan derived from the **REFAZ Security Audit Report** (2026-06-25, Consolidated D1), cross-referenced with inline annotations in commit [`84c3cff`](https://github.com/MarceloReFi/prisma-dids-audit/commit/84c3cffc82ce8af3508c8fd068cfe5fee5f1911e), and mapped to automated (Vitest) and manual tests in this repository.

**Primary source:** [`PRISMA_DIDs_Security_Audit_Report.pdf`](./PRISMA_DIDs_Security_Audit_Report.pdf)

**Related documents:**

| Document | Purpose |
|----------|---------|
| [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md) | Manual Preprod DID lifecycle checklist |
| [`P2_VC_IMPLEMENTATION_PLAN.md`](./P2_VC_IMPLEMENTATION_PLAN.md) | Post-audit implementation fixes (Audit Fix #1–#25) |

---

## 1. Executive summary

The REFAZ audit (June 25, 2026) reviewed the on-chain interaction layer (SDK, schemas, indexer), infrastructure/dependencies, web applications, and GDPR/LGPD data-protection posture. Scoring uses **CVSS v3.1** for security findings; data-protection findings use complementary regulatory severities.

| Category | Count | Test-plan focus |
|----------|-------|-----------------|
| MEDIUM-HIGH | 1 | F-META-01 — PII in on-chain VC signatures |
| MEDIUM | 5 | F-META-03, F-SIG-01, F-IDX-03, F-CFG-01, F-WEB-01 |
| LOW-MEDIUM | 6 | F-SIG-03, F-KEY-03, F-SIG-08, F-WEB-02, F-WEB-03, F-SIG-07 (resolved) |
| LOW | 5 | F-SIG-05, F-KEY-05, F-IDX-05, F-META-02 (mitigated), F-WEB-04 |
| INFO | 8 | F-META-05, F-META-06, F-KEY-04, F-DEP-02, etc. |
| POSITIVE | 16 | Regression guards for confirmed secure patterns |
| DATA PROTECTION | 5 | DP-01 through DP-05 — manual/compliance procedures |

**Overall assessment (from report):** Integrity and authentication are strong — every on-chain event is cryptographically verified, DID chain rules hold, VC status reduction is deterministic, and private keys never leave the wallet. Residual risk concentrates on **data minimization** (what reaches the permanent ledger) and **web/infrastructure hardening**.

This plan ensures audit findings are:

1. **Verified** by existing Vitest suites where applicable.
2. **Exercised** through manual/on-chain and compliance procedures where automation is insufficient.
3. **Tracked** with explicit gaps and recommended new test case IDs.

---

## 2. Scope

### In scope

| Domain | Components | Audit section |
|--------|------------|---------------|
| On-chain interaction | `packages/sdk`, `packages/schemas`, `apps/indexer` | §2 Technical findings |
| Web applications | `apps/dashboard`, `apps/vc-interface` | §3.3 F-WEB-* |
| Infrastructure | Dependencies, env config, Railway | §3.3 F-DEP-*, F-CFG-* |
| Data protection | On-chain metadata, IPFS, issuance flows | §4 DP-* |

### Out of scope

- Plutus smart contracts (metadata-based architecture — [ADR-001](./ADR-001_Prisma-DIDs_CIP68-vs-Metadata-v1.0.md))
- Dynamic penetration testing / fuzzing (report §5.4 limitation)
- Formal legal opinion on GDPR/LGPD compliance

### On-chain labels

| Label | Purpose |
|-------|---------|
| **199674** | DID events |
| **199675** | VC events |

---

## 3. Complete findings register

### 3.1 Security findings requiring test coverage

| ID | Severity | CVSS | Status | Location | Summary |
|----|----------|------|--------|----------|---------|
| **F-META-01** | **MEDIUM-HIGH** | 5.2 | Open | `vc-anchor.ts`; label 199675 | Full VC claim data embedded in on-chain `payloadSig` COSE blob — contradicts TECHNICAL_DESIGN §11.4 and CNIL off-chain pattern |
| **F-META-03** | MEDIUM | 3.7 | Open | `vc-anchor.ts`, `vc-event.ts` | `reason` field is unconstrained free text, permanent on-chain |
| **F-SIG-01** | MEDIUM | 2.1 | Open | `vc-anchor.ts`, `signature.ts` | Signs `JSON.stringify()` without RFC 8785 JCS; `stableSort()` for `vcHash` is not full JCS |
| **F-IDX-03** | MEDIUM | 3.7 | Open (trade-off) | `vc-processor.ts`, `vc.ts` | Unauthorized revokes stored at ingest; authorization at query time only |
| **F-CFG-01** | MEDIUM | — | Open | Next.js env (`NEXT_PUBLIC_*`) | Pinata API secret and Blockfrost key exposed in client bundle |
| **F-WEB-01** | MEDIUM | — | Open | `next.config.js` (both apps) | Missing HTTP security headers and Content-Security-Policy |
| **F-SIG-03** | LOW-MEDIUM | 1.3 | Accepted | `signature.ts` | DID `ts` appended after signing (VC events include `ts` in signature) |
| **F-KEY-03** | LOW-MEDIUM | 2.7 | Open | `keys.ts` | `extractRawPublicKey()` byte-scan with silent 32-byte fallback |
| **F-SIG-08** | LOW-MEDIUM | 3.7 | Open | `vc-event.ts` | `.passthrough()` allows unknown fields silently |
| **F-WEB-02** | LOW-MEDIUM | — | Open | `vc-interface` credentials page | Presentation transported in URL query string |
| **F-WEB-03** | LOW-MEDIUM | — | Open | `credentialStore.ts` | Credentials stored unencrypted in `localStorage` |
| **F-SIG-05** | LOW | — | Mitigated | `vc-verify.ts` | SDK credential verify uses non-canonical JSON; mitigated by indexer |
| **F-KEY-05** | LOW | — | Open | `signature.ts`, `vc-anchor.ts` | No address validation before `wallet.signData()` |
| **F-IDX-05** | LOW | — | Accepted | `vc-processor.ts` (issue) | Issue events skip anchor payload binding — related to F-META-01 |
| **F-META-02** | LOW | — | **Mitigated** | Indexer | Duplicate on-chain events; handled by chain validator + status reducer |
| **F-WEB-04** | LOW | — | Open | API routes | No rate limiting / body-size limits on public verify and DID proxy routes |
| **F-SIG-07** | INFO | — | **Resolved** | Schema/SDK | `ipfsCid` optional in schema but not populated by SDK builder |

### 3.2 Positive findings (regression guards)

| ID | Area | Finding | Primary tests |
|----|------|---------|---------------|
| F-KEY-01 | Keys | Private keys never in SDK; CIP-30 only | Architecture review; no key material in SDK bundle |
| F-KEY-02 | Crypto | `@noble/ed25519` async, audited | `verification.test.ts`, `vc-verify.test.ts` |
| F-SIG-04 | Crypto | COSE_Sign1 RFC 8152 compliant | `cose-verify.ts` usage in verification paths |
| F-IDX-01 | Indexer | Order-independent `jsonPayloadMatch()` | `vc-processor.test.ts` |
| F-IDX-02 | Indexer | DID chain validation (fork, version, dupes) | `chain-validator.test.ts`, `did-lifecycle.e2e.test.ts` |
| F-IDX-04 | Indexer | Production poller (reorg, crash recovery) | `poller.test.ts` |
| F-IDX-06 | Indexer | Deterministic VC status reducer | `vc-status-reducer.test.ts` |
| F-KEY-06 | Keys | Multibase conversion spec-compliant | `keys.test.ts` |
| F-META-07 | Metadata | DID path: CID-only on-chain | `metadata.test.ts`, `did-lifecycle.e2e.test.ts` |
| F-META-08 | Metadata | 64-byte chunking in production | `metadata.test.ts` |
| F-DEP-03 | Deps | Crypto core clean (no CVEs) | `pnpm audit` on crypto packages |
| F-DEP-04 | Deps | No Critical on production surface | `pnpm audit --prod` |
| F-CFG-02 | Config | `.gitignore`, no committed secrets | Repo hygiene check |
| F-WEB-P1 | Web | No XSS sinks (`dangerouslySetInnerHTML`, etc.) | Static code review |
| F-WEB-P2 | Web | i18n locale allowlist | Static code review |
| F-WEB-P3 | Web | No CSRF surface (wallet-signed mutations) | Architecture review |

### 3.3 Data-protection findings

| ID | DP severity | Technical correlate | GDPR articles | Test approach |
|----|-------------|---------------------|---------------|---------------|
| **DP-01** | High | F-META-01 | Art. 4, 5(1)(c), 17, 25 | MAN-01, META-01-* |
| **DP-02** | High | F-META-03 | Art. 5(1)(c), 9, 17 | MAN-03, META-03-* |
| **DP-03** | Medium | F-META-06 (INFO) | Art. 4(5), Recital 26 | Compliance review — privacy notice |
| **DP-04** | Medium | F-CFG-01 | Art. 28, 44–49 | Legal/procedural — Pinata DPA + SCCs |
| **DP-05** | Medium | (new) | Art. 12–22, 35 | Compliance review — DPIA, subject-rights channel |

---

## 4. Empirical on-chain evidence (Preprod)

From report §5.2 — use these transactions for manual regression.

| Label | Tx hash (full) | Finding | Expected test outcome |
|-------|----------------|---------|----------------------|
| 199674 | `2c641e25a82b4c1a21266d0d24144d50853799405978f837018b05036fa70730` | F-IDX-02 / F-META-02 | Second duplicate create rejected as `duplicate_create` |
| 199674 | `cf11b0eeae1fac37250b5ed13f79e5cb49f69b4a3b916d11feb71e0412a6074d` | F-META-02 | Duplicate DID create (pair with above) |
| 199675 | `e856e6bd244933f46a9a51a592165acbe4b85a319d3881fc0f5ad908b1fd99e0` | F-META-01 / DP-01 | Decoded COSE contains claims + `evidenceUrl` with session password; 31 chunks |
| 199675 | `114d72…cc16` (earliest) | F-IDX-06 / F-META-02 | Canonical revoke for `urn:uuid:53ca5da9-488e-4738-9e49-84c83be1e4de`, reason `issued_in_error` |
| 199675 | `19d65de…fdee`, `13c6d04…f25cc` | F-META-02 | Middle/latest of 3 duplicate revocations — reducer picks earliest authorized |

**F-META-01 decoded payload (report evidence):**

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

## 5. Test execution

### Automated

```bash
pnpm test                              # Full monorepo
pnpm --filter @prisma-events/dids-sdk test
pnpm --filter @prisma-events/dids-indexer test
pnpm type-check
pnpm audit                             # F-DEP-01 dependency check
pnpm audit --prod                      # Production surface only (F-DEP-04)
```

**Test runner:** Vitest 4 · **Test files:** 20 (`*.test.ts` in `packages/sdk`, `apps/indexer`)

### Manual

- [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md) — DID update/revoke on Preprod
- §8 below — audit-specific and web/infrastructure procedures

---

## 6. Finding → test coverage matrix

Legend: ✅ Covered · ⚠️ Partial · ❌ Gap · 🔵 Positive (regression guard)

### F-META-01 / DP-01 — PII in on-chain VC signatures (P0)

**Risk:** Semantically rich personal data permanently on Cardano; defeats selective-disclosure privacy promise at anchoring layer.

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| META-01-A | Auto | `vc.test.ts` — COSE-SD issuance produces `payloadSig` | ⚠️ |
| META-01-B | Auto | `vc-processor.test.ts` — issue schema validation | ⚠️ |
| META-01-C | Manual | Issue VC on Preprod; decode label **199675** metadata | ❌ |
| META-01-D | Manual | Assert no claim fields in anchor after R1 fix (CNIL pattern) | ❌ |
| META-01-E | Unit | `buildIssueAnchorEvent()` signs minimal field set only | ❌ (recommended) |
| META-01-F | Unit | Serialized metadata size bounded when claims contain long URLs | ❌ (recommended) |

**Pass criteria (post-remediation R1):** On-chain anchor contains only `{event, issuerDid, holderDid, vcHash, vcType, vcFormat, ts}` — matching validate/revoke pattern. Full credential remains IPFS-only.

---

### F-META-03 / DP-02 — Unconstrained revocation `reason` (P1)

**Risk:** Free-text PII (names, CPF, dismissal reasons) written permanently on-chain.

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| META-03-A | Auto | `vc-processor.test.ts` — accepts any reason string | ⚠️ |
| META-03-B | Auto | `vc-processor.test.ts` — makeRow persists reason | ⚠️ |
| META-03-C | Auto | `vc-status-reducer.test.ts` — reason from authorized revoke | ✅ |
| META-03-D | Manual | Submit revoke with 10 KB / PII-like reason | ❌ |
| META-03-E | Schema | Reject reason ∉ `{issued_in_error, expired, compromised, withdrawn_by_holder}` | ❌ (post-R2) |
| META-03-F | Schema | Reject reason > 64 chars | ❌ (post-R2) |

**Report recommendation:** Allowlist enum + 64-char max + PII keyword filter.

---

### F-SIG-01 — Non-canonical JSON signing (P3)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| SIG-01-A | Auto | `vc-processor.test.ts` — `jsonPayloadMatch` key-order | ✅ |
| SIG-01-B | Auto | `vc-verify.test.ts` — payload binding | ✅ |
| SIG-01-C | Auto | `vc.test.ts` — COSE-SD issuance | ⚠️ |
| SIG-01-D | Unit | `stableSort()` vs `json-canonicalize` edge cases | ❌ |
| SIG-01-E | Unit | `computeEd25519VcHash()` matches JCS (post-fix) | ❌ (recommended) |

**Mitigation today:** Indexer `jsonPayloadMatch()` (F-IDX-01) compensates for validate/revoke paths.

---

### F-IDX-03 — Deferred revoke authorization (P2)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| IDX-03-A | Auto | `vc-status-reducer.test.ts` — ignores unauthorized revoke | ✅ |
| IDX-03-B | Auto | `vc-status-reducer.test.ts` — issue→validate→bad revoke→good revoke | ✅ |
| IDX-03-C | Auto | `vc-processor.test.ts` — revoke row stored at ingest | ⚠️ |
| IDX-03-D | Manual | Non-issuer revoke in DB but `GET /vc/:hash/status` → active | ❌ |
| IDX-03-E | Integration | Unauthorized revoke: `valid=true` at ingest, ignored by reducer | ❌ (recommended) |
| IDX-03-H | Policy | Rate limit N revokes per vcHash (if implemented) | ❌ |

**Compounds:** F-META-03 (reason spam), F-WEB-04 (DoS via verify endpoint).

---

### F-IDX-05 — Issue events skip payload binding (LOW, related to F-META-01)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| IDX-05-A | Auto | `vc-processor.test.ts` — issue validation (signer = issuer) | ⚠️ |
| IDX-05-B | Design | Document intentional skip vs. F-META-01 remediation | ❌ |

---

### F-META-02 — Duplicate on-chain events (MITIGATED)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| META-02-A | Auto | `chain-validator.test.ts` — duplicate create rejected | ✅ |
| META-02-B | Auto | `did-lifecycle.e2e.test.ts` — duplicate create batch invalid | ✅ |
| META-02-C | Auto | `vc-status-reducer.test.ts` — deterministic earliest authorized revoke | ✅ |
| META-02-D | Manual | 3 duplicate revocations on same vcHash → earliest authorized wins | ✅ (audit) |

---

### F-SIG-03 — Unsigned DID `ts` (P5)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| SIG-03-A | Auto | `signature.test.ts` — ts added as ISO datetime | ✅ |
| SIG-03-B | Auto | `signature.test.ts` — signDIDPayload excludes ts from signed payload | ✅ |
| SIG-03-C | Auto | `did-lifecycle.e2e.test.ts` — full lifecycle schemas | ✅ |
| SIG-03-D | Manual | Tamper `ts` post-sign; indexer accepts if sig valid | ❌ |

---

### F-SIG-08 — Schema `.passthrough()` (LOW-MEDIUM)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| SIG-08-A | Auto | `vc-processor.test.ts` — required fields enforced | ✅ |
| SIG-08-B | Auto | `vc-processor.test.ts` — unknown event type rejected | ✅ |
| SIG-08-C | Unit | Extra `injectedField` passes schema via passthrough | ❌ |
| SIG-08-D | Schema | `.strict()` mode rejects unknown fields (staging) | ❌ (recommended) |

---

### F-KEY-03 — COSE key extraction fallback (P4)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| KEY-03-A | Auto | `keys.test.ts` — multibase conversion | ⚠️ |
| KEY-03-B | Auto | `verification.test.ts`, `vc-verify.test.ts` | ⚠️ |
| KEY-03-E | Unit | `extractRawPublicKey` throws on malformed CBOR | ❌ (recommended) |
| KEY-03-F | Unit | Matches `cborg.decode()` key `-2` for CIP-30 fixtures | ❌ (recommended) |

---

### F-SIG-05 — SDK credential payload binding (LOW, mitigated)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| SIG-05-A | Auto | `vc-verify.test.ts` — payload binding pass/fail | ✅ |
| SIG-05-B | Auto | `vc-processor.test.ts` — `jsonPayloadMatch` | ✅ |

---

### F-KEY-05 — No address validation before signing (P10)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| KEY-05-A | Unit | Invalid bech32 address rejected before `signData` | ❌ (recommended) |
| KEY-05-B | Auto | `signature.test.ts` — uses valid test address only | ⚠️ |

---

### F-CFG-01 — Client-exposed secrets (P7)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| CFG-01-A | Build | Grep production bundle for `NEXT_PUBLIC_PINATA_API_SECRET` | ❌ |
| CFG-01-B | Build | Confirm Pinata write ops use server route only (post-fix) | ❌ |
| CFG-01-C | Config | Railway panel: no write secrets under `NEXT_PUBLIC_` | ❌ (manual) |
| CFG-01-D | Static | `.env.example` documents server-only secrets | ⚠️ |

**Report evidence:** `NEXT_PUBLIC_PINATA_JWT` used in `CreateDID.tsx`, `RevokeDID.tsx`, `UpdateDID.tsx`.

---

### F-WEB-01 — Missing security headers (MEDIUM)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| WEB-01-A | Manual | `curl -I` dashboard + vc-interface — check CSP, HSTS, X-Frame-Options | ❌ |
| WEB-01-B | Manual | Verify `Referrer-Policy: no-referrer` (mitigates F-WEB-02) | ❌ |
| WEB-01-C | Config | `next.config.js` defines `headers()` in both apps | ❌ (post-fix) |

---

### F-WEB-02 — Presentation in URL query string (LOW-MEDIUM)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| WEB-02-A | Manual | Share link uses `/verify?p=...` — check history/logs exposure | ❌ |
| WEB-02-B | Manual | Post-fix: fragment transport `/verify#p=...` or POST token | ❌ |

---

### F-WEB-03 — Credentials in localStorage (LOW-MEDIUM)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| WEB-03-A | Manual | DevTools → Application → localStorage — plaintext credential JSON | ❌ |
| WEB-03-B | Manual | "Clear local data" control for holder (post-fix) | ❌ |
| WEB-03-C | Combined | CSP from F-WEB-01 reduces XSS exfiltration path | ❌ |

---

### F-WEB-04 — API rate limiting (LOW)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| WEB-04-A | Manual | Flood `POST /api/verify` — observe CPU/429 behavior | ❌ |
| WEB-04-B | Manual | Oversized request body to verify route | ❌ |
| WEB-04-C | Manual | DID proxy — network param not allowlisted | ❌ |

---

### F-DEP-01 — Dependency vulnerabilities (P6)

| Test ID | Type | Procedure | Status |
|---------|------|-----------|--------|
| DEP-01-A | CI | `pnpm audit` — document Critical/High counts | ❌ (process) |
| DEP-01-B | CI | `pnpm audit --prod` — zero Critical (F-DEP-04) | ❌ (process) |
| DEP-01-C | Manual | After `pnpm update`, re-audit before production | ❌ |

**Report:** 0 Critical on production; High advisories mostly DoS in axios, ws, next, fastify — patchable by bump.

---

### Positive findings — regression guards

| Finding | Key automated tests |
|---------|---------------------|
| F-IDX-01 | `vc-processor.test.ts` — jsonPayloadMatch (6 cases) |
| F-IDX-02 | `chain-validator.test.ts` (8), `did-lifecycle.e2e.test.ts` (negative cases) |
| F-IDX-04 | `poller.test.ts` — crash recovery, incremental poll |
| F-IDX-06 | `vc-status-reducer.test.ts` (14), `vc-verify.test.ts` (revocation) |
| F-META-07 | `metadata.test.ts`, `did-lifecycle.e2e.test.ts` |
| F-META-08 | `metadata.test.ts` — 64-char chunking |
| F-KEY-02/06 | `verification.test.ts`, `keys.test.ts` |

---

## 7. Existing automated test inventory

~180 test cases across 20 files.

### SDK — Cryptography and identity

| File | Tests | Findings |
|------|-------|----------|
| `signature.test.ts` | 9 | F-SIG-03 |
| `verification.test.ts` | 5 | F-KEY-02, F-SIG-04 |
| `stake.test.ts` | 3 | Controller binding |
| `keys.test.ts` | 6 | F-KEY-03 (partial), F-KEY-06 |
| `encoding.test.ts` | 7 | Encoding correctness |
| `did.test.ts` | 8 | DID structure |
| `payload.test.ts` | 6 | Version monotonicity |
| `metadata.test.ts` | 10 | F-META-08, 16 KB limit |

### SDK — Verifiable credentials

| File | Tests | Findings |
|------|-------|----------|
| `vc.test.ts` | 18 | F-META-01 (partial), COSE-SD |
| `vc-verify.test.ts` | 22 | F-SIG-05, F-IDX-06, revocation |
| `vc-discovery.test.ts` | 4 | Service endpoints |
| `did-lifecycle.e2e.test.ts` | 8 | F-META-07, F-SIG-03 |

### Indexer

| File | Tests | Findings |
|------|-------|----------|
| `chain-validator.test.ts` | 8 | F-IDX-02, F-META-02 |
| `did-processor.test.ts` | 16 | DID ingest |
| `vc-processor.test.ts` | 20 | F-IDX-01, F-IDX-03, F-IDX-05, F-META-03 |
| `did-lifecycle.e2e.test.ts` | 12 | F-IDX-02, F-META-02 |
| `metadata.test.ts` | 9 | F-META-08 |
| `poller.test.ts` | 6 | F-IDX-04 |
| `blockfrost.test.ts` | 6 | Source resilience |
| `vc-status-reducer.test.ts` | 14 | F-IDX-06, F-IDX-03, F-META-02 |

---

## 8. Manual test procedures

### MAN-01 — On-chain metadata privacy (F-META-01 / DP-01)

1. Issue `ContributionCredential` with distinctive `evidenceUrl` containing a test secret.
2. Confirm tx on Preprod; inspect metadata label **199675**.
3. Decode `payloadSig` (hex → UTF-8 → JSON → COSE).
4. **Pre-fix (documents finding):** Claims visible including `evidenceUrl`.
5. **Post-fix R1 (pass):** Only minimal anchor fields; claims absent from chain.

### MAN-02 — Duplicate DID create (F-IDX-02 / F-META-02)

1. Create DID (v=1 confirmed).
2. Submit second `create` for same stake address.
3. **Expected:** `valid: false`, error `duplicate_create` in history API.

### MAN-03 — Unauthorized revocation (F-IDX-06 / F-IDX-03 / DP-02)

1. Issue VC as Issuer A.
2. Revoke from Wallet B with reason `unauthorized attempt`.
3. **API:** `GET /vc/{vcHash}/status` → `active`.
4. **DB (F-IDX-03):** Row exists with reason text stored.
5. Authorized revoke from Issuer A → `revoked`; `revokedTxHash` is A's tx.

### MAN-04 — DID lifecycle (F-IDX-02)

Follow [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md) C.3 and C.4.

### MAN-05 — Metadata 16 KB limit (F-META-08)

Build payload approaching 16 KB → SDK throws before submission (`metadata.test.ts` covers serialization).

### MAN-06 — Security headers (F-WEB-01)

```bash
curl -I https://<dashboard-host>/
curl -I https://<vc-interface-host>/
```

Verify presence of: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.

### MAN-07 — Client bundle secrets (F-CFG-01)

1. Build production bundle for dashboard and vc-interface.
2. Search output for Pinata secret/JWT strings.
3. **Pass:** No write-capable Pinata credentials in client JS.

### MAN-08 — Presentation URL leakage (F-WEB-02)

1. Generate share link from credentials page.
2. Confirm whether presentation is in query (`?p=`) or fragment (`#p=`).
3. Check server/proxy logs for query string persistence.

### MAN-09 — Data-protection compliance (DP-03, DP-04, DP-05)

| Check | Procedure |
|-------|-----------|
| DP-03 | Privacy notice states DIDs are pseudonymised personal data |
| DP-04 | Pinata DPA + EU SCCs on file before production |
| DP-05 | Data-subject request channel documented; DPIA conducted; issuance flow warns of on-chain immutability |

---

## 9. Remediation priority matrix (from report §5.3)

Aligned with audit remediation order. Test cases above use matching P0–P10 labels.

| Prio | Finding | Effort | Test gate |
|------|---------|--------|-----------|
| **P0** | F-META-01 / DP-01 — minimal on-chain anchor | 2–4 h | MAN-01, META-01-E/F |
| **P1** | F-META-03 / DP-02 — reason enum + 64 chars | 30 min | META-03-E/F |
| **P2** | F-IDX-03 — ingest reject + rate limit | 1 h | IDX-03-E/H |
| **P3** | F-SIG-01 — canonicalize with stableSort/JCS | 1 h | SIG-01-D/E |
| **P4** | F-KEY-03 — cborg.decode() for COSE_Key | 1 h | KEY-03-E/F |
| **P5** | F-SIG-03 — sign DID ts | 15 min | SIG-03-D |
| **P6** | F-DEP-01 — dependency update | 1 h | DEP-01-A/B |
| **P7** | F-CFG-01 — Pinata secret server-side | 1–2 h | CFG-01-A/B |
| **P8** | DP-04 — Pinata DPA + SCCs | Legal | MAN-09 |
| **P9** | DP-05 — subject-rights + DPIA | 1 day | MAN-09 |
| **P10** | F-KEY-05 — address validation | 15 min | KEY-05-A |

---

## 10. Release regression checklist

### Automated (every release)

- [ ] `pnpm test` — all 20 test files green
- [ ] `pnpm type-check`
- [ ] `pnpm audit --prod` — zero Critical (F-DEP-04)
- [ ] F-IDX-02: `chain-validator.test.ts` + `did-lifecycle.e2e.test.ts`
- [ ] F-IDX-06: `vc-status-reducer.test.ts` unauthorized revoke cases
- [ ] F-IDX-01: `jsonPayloadMatch` key-order tests
- [ ] COSE: `vc-verify.test.ts` + `verification.test.ts`

### Manual (when affected code changes)

| Change area | Manual tests |
|-------------|--------------|
| VC anchoring / SDK issue path | MAN-01 |
| DID lifecycle | MAN-04 |
| Revoke authorization | MAN-03 |
| Next.js apps | MAN-06, MAN-07, MAN-08 |
| Dependencies | DEP-01-C |
| Pre-production launch | MAN-09 (DP-03–DP-05) |

---

## 11. Traceability index

| Finding | Severity | Automated tests | Manual |
|---------|----------|-----------------|--------|
| F-META-01 / DP-01 | MEDIUM-HIGH | `vc.test.ts` (partial) | MAN-01 |
| F-META-03 / DP-02 | MEDIUM | `vc-processor.test.ts`, `vc-status-reducer.test.ts` | MAN-03 |
| F-META-02 | LOW (mitigated) | `chain-validator.test.ts`, `vc-status-reducer.test.ts` | MAN-02 |
| F-SIG-01 | MEDIUM | `vc-processor.test.ts`, `vc-verify.test.ts` | — |
| F-SIG-03 | LOW-MEDIUM | `signature.test.ts`, `did-lifecycle.e2e.test.ts` | MAN-04 |
| F-SIG-05 | LOW | `vc-verify.test.ts` | — |
| F-SIG-08 | LOW-MEDIUM | `vc-processor.test.ts` | — |
| F-KEY-03 | LOW-MEDIUM | `keys.test.ts` (partial) | — |
| F-KEY-05 | LOW | — | — |
| F-IDX-01 | POSITIVE | `vc-processor.test.ts` | — |
| F-IDX-02 | POSITIVE | `chain-validator.test.ts`, `did-lifecycle.e2e.test.ts` | MAN-02, MAN-04 |
| F-IDX-03 | MEDIUM | `vc-status-reducer.test.ts` | MAN-03 |
| F-IDX-04 | POSITIVE | `poller.test.ts` | — |
| F-IDX-05 | LOW | `vc-processor.test.ts` (partial) | — |
| F-IDX-06 | POSITIVE | `vc-status-reducer.test.ts`, `vc-verify.test.ts` | MAN-03 |
| F-CFG-01 | MEDIUM | — | MAN-07 |
| F-WEB-01 | MEDIUM | — | MAN-06 |
| F-WEB-02 | LOW-MEDIUM | — | MAN-08 |
| F-WEB-03 | LOW-MEDIUM | — | MAN-08 |
| F-WEB-04 | LOW | — | MAN-06 |
| F-DEP-01 | MEDIUM | — | DEP-01-* |
| DP-03 | Medium | — | MAN-09 |
| DP-04 | Medium | — | MAN-09 |
| DP-05 | Medium | — | MAN-09 |

---

*Aligned with REFAZ Security Audit Report (2026-06-25), commit `84c3cffc82ce8af3508c8fd068cfe5fee5f1911e`, and Vitest suite as of 2026-07-26.*
