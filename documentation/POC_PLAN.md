# Prisma DIDs – POC Plan (P0)

**Goal:** Frontend POC that connects a CIP-30 wallet, generates a W3C DID Document, pins it to IPFS, builds a spec-compliant DID event, signs it, and submits a metadata tx to preprod/mainnet.

**Aligned with:** ADR-001 (metadata approach), TECHNICAL_DESIGN v1.6.2 (§2, §3, §5.3, §6.4, §1.4, §1.5)

---

## Architecture Note: DID/VC Separation (v1.6.2)

Per TECHNICAL_DESIGN v1.6.2, the system is split into **Global** and **Forkable** components:

### Global Infrastructure (Prisma-operated)
| Component | Current Location | Target Location | Purpose |
|-----------|------------------|-----------------|---------|
| DID Dashboard | `apps/dashboard` | `apps/did-dashboard` | Universal DID management for all Cardano users |
| DID Indexer | `apps/indexer` | `apps/did-indexer` | Single source of truth for all `did:cardano` DIDs |

### Forkable Components (Per-organization)
| Component | Current Location | Target Location | Purpose |
|-----------|------------------|-----------------|---------|
| VC Interface | `apps/vc-interface` | `apps/vc-interface` | Branded credential UI per org |
| VC Indexer | — | `apps/vc-indexer` | Indexes org-specific VC events |

### Key Principle: VCs Depend on Global DIDs

VCs are **fully dependent** on the global DID infrastructure:
- **Issuer DID:** Must have valid, non-revoked DID to issue VCs
- **Holder DID:** VCs are issued TO a holder's DID (`credentialSubject.id`)
- **Verification:** Resolves issuer DID → checks signature + revocation status
- **Service Discovery:** Issuer's DID Document contains `VCIndexer` service endpoint

**Prisma Pilot:** The first VC Interface deployment is **Action Learning Journey (ALJ)**, which issues `ContributionCredential` VCs for learning contributions.

### Monorepo Structure (v1.6.1 §1.5)

> **Key distinction:** `packages/` = imported as dependencies, `apps/` = deployed as services

**Current Structure:**
```
packages/
├── sdk/                   # Core SDK (imported by apps)
├── types/                 # Shared TypeScript types
├── crypto/                # Stub for future VC signing
└── ui/                    # Stub for shared components

apps/
├── dashboard/             # DID Dashboard (rename to did-dashboard planned)
├── indexer/               # DID Indexer (rename to did-indexer planned)
├── api/                   # Stub (will merge into indexer)
└── vc-interface/          # VC Interface mockup ✅
```

**Target Structure (after restructure):**
```
packages/
├── schemas/               # Shared credential schemas (extensible)
├── sdk/                   # Core SDK
└── types/                 # Shared TypeScript types

apps/
├── did-dashboard/         # Global DID Dashboard
├── indexer/               # Configurable Indexer (ONE codebase)
│   ├── configs/
│   │   ├── did-indexer.ts   # DID config: L_DID, did_events table
│   │   └── vc-indexer.ts    # VC config: L_VC, vc_events table
│   └── ...
└── vc-interface/          # Forkable VC frontend
```

> **Indexer Architecture:** Single codebase, multiple deployments via config.
> - **DID Indexer deployment:** Prisma-operated, indexes L_DID globally
> - **VC Indexer deployment:** Per-org fork, indexes L_VC (or custom labels)

### Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PACKAGES (shared)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  packages/types ──────────────────────────────────────────────────► │
│       │                                                             │
│       ▼                                                             │
│  packages/schemas ─────► Credential type definitions (Zod)          │
│       │                  - ContributionCredential                   │
│       │                  - Custom types by forkers                  │
│       ▼                                                             │
│  packages/sdk ─────────► VC functions use schemas for validation    │
│                          - issueSDJwtVC(), verifyPresentation()     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  apps/indexer   │  │ apps/vc-interface│  │ apps/did-dashboard│
│  (configurable) │  │   (forkable)    │  │    (global)     │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ Configs:        │  │ Uses:           │  │ Uses:           │
│ - did-indexer   │  │ - packages/sdk  │  │ - packages/sdk  │
│ - vc-indexer    │  │ - packages/schemas│ │ - DID Indexer   │
│ - custom...     │  │ - VC Indexer API│  │                 │
└────────┬────────┘  └────────┬────────┘  └─────────────────┘
         │                    │
         │    ┌───────────────┘
         ▼    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENTS                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐    ┌─────────────────────────────────────┐│
│  │ GLOBAL (Prisma)     │    │ PER-ORG (Forked)                    ││
│  ├─────────────────────┤    ├─────────────────────────────────────┤│
│  │ • DID Dashboard     │    │ • VC Interface (ALJ, Org2, ...)     ││
│  │ • DID Indexer       │◄───│ • VC Indexer (queries DID Indexer)  ││
│  │   (L_DID only)      │    │   (L_VC or custom labels)           ││
│  └─────────────────────┘    └─────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Dependencies:**
- `packages/schemas` → used by SDK (validation) + Indexer (event validation)
- `apps/indexer` → ONE codebase, config determines DID vs VC behavior
- VC Indexer → queries global DID Indexer to verify issuer DIDs
- VC Interface → queries its org's VC Indexer for credential status

---

## Version 1.2 Updates (Critical Refinements)

This version incorporates production-ready implementation details:

1. **Public Key Format Conversion** (NEW): Added `hexToPublicKeyMultibase()` helper to convert CIP-30 hex keys to W3C multibase format (z6Mk...)
2. **CIP-30 Hex Encoding** (CRITICAL): Wallets expect hex-encoded payloads for `signData`; verification uses UTF-8 bytes
3. **Blockfrost Mandatory**: Tx submission requires provider; moved Blockfrost/Pinata to Prerequisites (2-5 min setup)
4. **Constant Consistency**: Use `L_DID`/`L_VC` constants everywhere (not magic numbers)
5. **Full Update/Revoke in P0**: With Blockfrost key available, complete create → update → revoke flow is testable
6. **Enhanced Testing**: Added key conversion, hex encoding, and end-to-end update/revoke tests

**Key Takeaway:** P0 now delivers a fully functional, spec-compliant DID system (create/update/revoke) instead of just create.

---

## 📊 Progress Tracker

### Prerequisites (Blocking) - 3/3 Complete ✅
- [x] Blockfrost account (preprod + mainnet keys)
- [x] Pinata account (API keys)
- [x] Test wallet installed with preprod ADA

### Phase 0: Monorepo Foundation (Day 1) - 1/1 Complete ✅
- [x] Complete turborepo setup (all apps/packages structure)

### Phase A: Core SDK (Week 1) - 11/11 Complete ✅
- [x] 1. Implement SDK core modules
- [x] 2. Constants & Types
- [x] 3. Stake derivation helper
- [x] 4. Key format conversion (hex → multibase)
- [x] 5. DID Document generator
- [x] 6. Pinata client
- [x] 7. Payload builder & signature
- [x] 8. Self-verification
- [x] 9. Metadata serialization & tx builder
- [x] 10. Provider interface (Blockfrost)
- [x] 11. Basic SDK test suite (Vitest)

### Phase B: Dashboard UI (Week 1) - 1/1 Complete ✅
- [x] 12. Wallet picker + create DID flow
  - ✅ Full tx submission to Cardano blockchain via Lucid
  - ✅ Metadata chunking for Cardano's 64-byte string limit
  - ✅ DID lookup with chunked metadata reconstruction
  - ✅ Explorer links (CardanoScan preprod/mainnet)
  - ✅ **TESTED:** [tx 0fb3fb06...](https://preprod.cardanoscan.io/transaction/0fb3fb060f2e631445ea34ae0757bd7b0ff1a35eb841f6b4c5f3b17c7fe724e7)

### Phase C-D: Update/Revoke & Testing (Week 2) - 2/7 In Progress 🔄
- [x] **C.1:** Update DID code implementation
- [x] **C.2:** Revoke DID code implementation
- [ ] **C.3:** Test Update DID on Preprod
- [ ] **C.4:** Test Revoke DID on Preprod
- [ ] **D.1:** Comprehensive unit tests (>80% coverage)
- [ ] **D.2:** E2E test (create → update → revoke)
- [ ] **D.3:** Documentation (SDK + Dashboard READMEs)

---

### Phase E: VC Interface Mockup (Week 2-3) - 7/7 Complete ✅
> **Purpose:** Create React mockup UI for the forkable VC Interface before implementing SDK VC functions.

- [x] **E.1:** Create `apps/vc-interface` Next.js app with parametrization config
- [x] **E.2:** Issuance Form component (credential type, claims, disclosable checkboxes)
- [x] **E.3:** Credential Inbox component (holder views VCs, status filters)
- [x] **E.4:** Selective Disclosure component (claim checkboxes, preview, share link)
- [x] **E.5:** Revocation UI component (issuer revokes with reason)
- [x] **E.6:** Verifier View component (paste credential → verification flow per §2.2)
- [x] **E.7:** Credential Detail Modal (full claims, tx hash, IPFS links)

**Parametrization Config:**
```typescript
interface VCInterfaceConfig {
  ORG_NAME: string;             // "Your Organization"
  ORG_LOGO?: string;            // Logo asset path (optional)
  CREDENTIAL_TYPES: string[];   // ["ContributionCredential"]
  ISSUER_DIDS: string[];        // Authorized issuer DIDs
  THEME: ThemeConfig;           // Colors: primary, secondary, background, text, status
  INDEXER_ENDPOINT: string;     // Org's VC Indexer URL
  DID_INDEXER_ENDPOINT: string; // Global DID Indexer (Prisma-operated)
  NETWORK: 'preprod' | 'mainnet';
}
```

---

### P1: Configurable Indexer + DID Config (Week 3-4) - 0/8 Pending
> **Architecture:** Single indexer codebase with config-driven behavior. P1 builds the core + DID config.

**Core Indexer (configurable):**
- [ ] Indexer configuration system:
  ```typescript
  interface IndexerConfig {
    name: string;                      // "DID Indexer" or "ALJ VC Indexer"
    labels: number[];                  // Which metadata labels to index
    eventsTable: string;               // "did_events" or "vc_events"
    schemas: Record<number, ZodSchema>;// Validation per label
    endpoints: EndpointConfig[];       // Which API routes to enable
  }
  ```
- [ ] PostgreSQL schema supporting both `did_events` and `vc_events` tables
- [ ] Generic indexer worker (Blockfrost webhooks/polling for configured labels)
- [ ] Configurable REST API (endpoints enabled per config)
- [ ] Remove `apps/api` stub (merged into indexer)

**DID Indexer Config (Prisma-operated):**
- [ ] `configs/did-indexer.ts`: L_DID (199674), `did_events` table, DID endpoints
- [ ] Wire DID Indexer to DID Dashboard
- [ ] Deploy DID Indexer instance to Railway

> **P2b adds:** VC Indexer config for the same codebase (L_VC, `vc_events`, VC endpoints).

### P2a: SDK VC & Anchoring (Week 5) - 0/14 Pending

**Credential Schemas Package (`packages/schemas`):**
> **Purpose:** Extensible credential type definitions that both VC Interface and VC Indexer depend on.

- [ ] **2A.0a:** Create `packages/schemas` package structure
- [ ] **2A.0b:** Base credential schema types (Zod) - extensible by forkers
- [ ] **2A.0c:** `ContributionCredential` schema (claims: projectId, contributionType, hours, etc.)
- [ ] **2A.0d:** Schema registry pattern for custom credential types

**SDK VC Functions:**
- [ ] **2A.1:** `issueSDJwtVC()` - Issue SD-JWT VC with selective disclosure
- [ ] **2A.2:** `createPresentation()` - Create verifiable presentation
- [ ] **2A.3:** `verifyPresentation()` - Verify presentation signature + revocation
- [ ] **2A.4:** `getDisclosableClaims()` - Get list of disclosable claims from VC

**VC Revocation:**
- [ ] **2A.5:** `revokeVC()` - Submit revocation event on-chain
- [ ] **2A.6:** `checkRevocationStatus()` - Query indexer for VC status

**VC Anchoring:**
- [ ] **2B.1:** VC anchor schema (jti-based vcHash)
- [ ] **2B.2:** VC issuance anchor builder
- [ ] **2B.3:** VC anchor validation
- [ ] **2B.4:** VC anchor provider interface

### P2b: VC Interface Integration & VC Indexer Config (Week 6) - 0/18 Pending
> **Architecture:** VC Indexer = same indexer codebase from P1 + VC-specific config. Forkers deploy their own instance.

**Wire VC Interface to SDK (mockup → functional):**
- [ ] **2C.1:** Connect IssuanceForm to `issueSDJwtVC()` from SDK
- [ ] **2C.2:** Connect CredentialInbox to holder's VC list (via VC Indexer)
- [ ] **2C.3:** Connect SelectiveDisclosure to `createPresentation()`
- [ ] **2C.4:** Connect RevocationUI to `revokeVC()`
- [ ] **2C.5:** Add VCIndexer service endpoint to issuer DID Documents

**VC Indexer Config (uses same indexer from P1):**
- [ ] **2C.6:** `configs/vc-indexer.ts`: L_VC (199675), `vc_events` table, VC endpoints
- [ ] **2C.7:** VC-specific endpoints (enabled via config):
  - `GET /vc/:vcHash` → VC anchor events (issue, validate, revoke)
  - `GET /vc/:vcHash/status` → Current status (active/revoked)
  - `GET /issuer/:did/credentials` → All VCs issued by DID
  - `GET /holder/:did/credentials` → All VCs held by DID
  - `GET /schemas` → Supported credential schemas
- [ ] **2C.8:** Schema validation using `packages/schemas` for VC events

**Forkability Infrastructure:**
- [ ] **2C.9:** `.env.example` for vc-interface (ORG_NAME, INDEXER_ENDPOINT, etc.)
- [ ] **2C.10:** `.env.example` for indexer (DATABASE_URL, BLOCKFROST_KEY, LABELS, etc.)
- [ ] **2C.11:** Example fork config: `configs/alj-vc-indexer.ts` (ALJ pilot)
- [ ] **2C.12:** Deploy ALJ VC Indexer instance (same codebase, ALJ config)

**Testing:**
- [ ] **2D.1:** Unit tests for SDK VC functions
- [ ] **2D.2:** E2E test: issue → present → verify flow
- [ ] **2D.3:** Revocation test suite
- [ ] **2D.4:** Integration tests (SDK + Indexer)
- [ ] **2D.5:** jti hash strategy test: verify revocation check works from any presentation
- [ ] **2D.6:** Verifier discovery test: resolve issuer DID → find VCIndexer endpoint

### P3: Polish, Deployments & Fork Documentation (Week 7-8) - 0/14 Pending
> **Note:** Separate deployments for DID Dashboard (universal) and VC Interface (per-org).

**UI/UX Polish:**
- [ ] DID Dashboard UI/UX polish
- [ ] VC Interface UI/UX polish
- [ ] Wallet error handling refinements
- [ ] Brazilian Portuguese (pt-BR) language support for DID Dashboard
- [ ] Brazilian Portuguese (pt-BR) language support for VC Interface

**Deployments:**
- [ ] Deploy DID Dashboard to Vercel (prisma-dids.io)
- [ ] Deploy DID Indexer to Railway (did-indexer.prisma-dids.io)
- [ ] Deploy VC Interface - ALJ instance (alj.prisma-dids.io)
- [ ] Deploy VC Indexer - ALJ instance (vc-indexer.alj.prisma-dids.io)

**Fork Documentation:**
- [ ] **VC Interface Fork Guide:**
  - How to fork and customize (org-config.ts)
  - Adding custom credential types
  - Theming and branding
  - Deployment to Vercel/Netlify
- [ ] **VC Indexer Fork Guide:**
  - Creating custom indexer config
  - Setting up PostgreSQL
  - Custom metadata labels
  - Deployment to Railway/Fly.io
- [ ] **Credential Schema Authoring Guide:**
  - How to define new credential types in `packages/schemas`
  - Claim validation with Zod
  - Registering schemas with indexer
- [ ] **SDK VC Usage Guide:**
  - Issue, present, verify flow
  - Selective disclosure examples

**Pilot:**
- [ ] ALJ pilot feedback collection

### Future: BBS+ & Advanced ZK - Not Started
- [ ] Evaluate BLS12-381 library options
- [ ] Implement `issueBBSVC()` with unlinkable presentations
- [ ] Add `vcFormat: "bbs"` support
- [ ] Dual-format retrocompatibility

---

### **Overall Progress**

| Phase | Tasks | Complete | Status |
|-------|-------|----------|--------|
| P0 Prerequisites | 3 | 3 | ✅ Done |
| P0 Phase 0-B | 13 | 13 | ✅ Done |
| P0 Phase C-D | 7 | 2 | 🔄 In Progress |
| **Phase E: VC Mockup** | 7 | 7 | ✅ Done |
| P1 Configurable Indexer | 8 | 0 | ⏳ Pending |
| P2a SDK/Schemas/Anchoring | 14 | 0 | ⏳ Pending |
| P2b VC Integration/Config | 18 | 0 | ⏳ Pending |
| P3 Polish/Fork Docs | 14 | 0 | ⏳ Pending |
| **Total** | **84** | **25** | **30%** |

> **⚠️ v1.6.2 Architecture Notes:**
> - **Phase E (DONE):** VC Interface mockup with all 7 components
> - **P1:** Configurable Indexer (ONE codebase) + DID config deployment
> - **P2a:** `packages/schemas` for extensible credential types
> - **P2b:** VC Indexer config (same codebase) + forkability infrastructure
> - **P3:** Fork documentation guides for VC Interface, VC Indexer, Schemas

### Current Status
- **Create DID:** ✅ Tested & verified on Preprod
- **Update DID:** 🔄 Code complete, awaiting test
- **Revoke DID:** 🔄 Code complete, awaiting test
- **SD-JWT VCs:** ⏳ Roadmap defined, implementation pending

**Note:** Phase 0 establishes the complete monorepo foundation before implementation begins.

---

## 🧪 Manual Testing Guide - Verify Completed Phases

### ✅ Prerequisites Verification

**Test 1: Environment Variables**
```bash
cat .env.local
# Should show:
# - BLOCKFROST_PREPROD_KEY=preprod...
# - PINATA_API_KEY=7f206c...
# - PINATA_API_SECRET=a8cb34...
# - DEFAULT_NETWORK=Preprod
```

**Test 2: Wallet Installed**
- Open Eternl browser extension
- Confirm you have a preprod wallet with test ADA

---

### ✅ Phase 0: Monorepo Structure

**Test 1: Verify Directory Structure**
```bash
ls -la apps/
# Should show: dashboard, api, indexer

ls -la packages/
# Should show: sdk, types, crypto, ui
```

**Test 2: Verify Build Works**
```bash
pnpm build
# Should complete without errors
# All 7 packages should build successfully
```

**Test 3: Verify Package Imports**
```bash
cd packages/sdk && ls -la dist/
# Should show compiled .js and .d.ts files

cd ../types && ls -la dist/
# Should show compiled type definitions
```

**Test 4: Verify Dashboard Runs**
```bash
pnpm --filter @prisma-dids/dashboard dev
# Navigate to http://localhost:3000
# Should see "Prisma DIDs Dashboard" page
```

---

### ✅ Phase A: Core SDK - Module-by-Module Tests

**Test 1: Constants & Types Export**
```bash
node -e "
const { L_DID, L_VC, NETWORK } = require('./packages/types/dist/index.js');
console.log('L_DID:', L_DID);
console.log('L_VC:', L_VC);
console.log('NETWORK:', NETWORK);
"
# Expected output:
# L_DID: 199674
# L_VC: 199675
# NETWORK: { PREPROD: 0, MAINNET: 1 }
```

**Test 2: Stake Derivation**
```bash
node -e "
const { deriveStakeAddressFromBaseAddress, isBaseAddress } = require('./packages/sdk/dist/utils/stake.js');

// Test with a valid preprod base address
const testAddr = 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';

console.log('Is base address:', isBaseAddress(testAddr));
console.log('Derived stake:', deriveStakeAddressFromBaseAddress(testAddr));
"
# Expected:
# Is base address: true
# Derived stake: stake_test1... (should start with stake_test1)
```

**Test 3: Key Format Conversion**
```bash
node -e "
const { hexToPublicKeyMultibase, isValidPublicKeyMultibase } = require('./packages/sdk/dist/utils/keys.js');

// Test with 32-byte hex key (64 hex chars)
const hexKey = '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29';
const multibase = hexToPublicKeyMultibase(hexKey);

console.log('Multibase key:', multibase);
console.log('Is valid:', isValidPublicKeyMultibase(multibase));
console.log('Starts with z:', multibase.startsWith('z'));
"
# Expected:
# Multibase key: z6Mk... (should be ~48 chars)
# Is valid: true
# Starts with z: true
```

**Test 4: DID Document Generation**
```bash
node -e "
const { deriveDID, generateDIDDocument } = require('./packages/sdk/dist/core/did.js');

const stakeAddr = 'stake_test1uqevw7fgvjna3ty89hxvp72gytmm8lf8qmx6rpshfmgc2cclq5c3a';
const did = deriveDID(stakeAddr);
const hexPubKey = '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29';

const doc = generateDIDDocument({ did, publicKeyHex: hexPubKey });

console.log('DID:', doc.id);
console.log('Verification Method:', doc.verificationMethod[0].type);
console.log('Public Key Format:', doc.verificationMethod[0].publicKeyMultibase.substring(0, 10) + '...');
"
# Expected:
# DID: did:cardano:stake_test1...
# Verification Method: Ed25519VerificationKey2020
# Public Key Format: z6Mk...
```

**Test 5: Payload Builders**
```bash
node -e "
const { buildCreatePayload, buildUpdatePayload, buildRevokePayload } = require('./packages/sdk/dist/core/payload.js');

const did = 'did:cardano:stake_test1uqevw7fgvjna3ty89hxvp72gytmm8lf8qmx6rpshfmgc2cclq5c3a';
const cid = 'QmTESTCID123456789';

const createPayload = buildCreatePayload({ did, ipfsCid: cid });
console.log('Create payload:', JSON.stringify(createPayload, null, 2));

const updatePayload = buildUpdatePayload({ did, ipfsCid: cid, prevTxHash: 'abc123', version: 2 });
console.log('\\nUpdate action:', updatePayload.action, 'v:', updatePayload.v);

const revokePayload = buildRevokePayload({ did, ipfsCid: cid, prevTxHash: 'def456', version: 3 });
console.log('Revoke action:', revokePayload.action, 'v:', revokePayload.v);
"
# Expected: Valid payload objects with correct actions and versions
```

**Test 6: Pinata Client (Real API Test)**
```bash
node -e "
const { PinataClient } = require('./packages/sdk/dist/core/ipfs.js');

const client = new PinataClient({
  apiKey: process.env.PINATA_API_KEY,
  apiSecret: process.env.PINATA_API_SECRET
});

(async () => {
  try {
    const testData = { test: 'Prisma DIDs test', timestamp: Date.now() };
    const cid = await client.pinJSON(testData);
    console.log('✅ Pinata working! CID:', cid);

    const verified = await client.verifyPin(cid);
    console.log('✅ Pin verified:', verified);
  } catch (error) {
    console.error('❌ Pinata error:', error.message);
  }
})();
"
# Expected: Should pin test data and return CID (Qm...)
# This is a REAL test - it will create a pin on your Pinata account
```

**Test 7: Metadata Serialization**
```bash
node -e "
const { serializeDIDMetadata } = require('./packages/sdk/dist/tx/metadata.js');
const { L_DID } = require('./packages/types/dist/index.js');

const testEvent = {
  id: 'did:cardano:stake_test1uqevw7fgvjna3ty89hxvp72gytmm8lf8qmx6rpshfmgc2cclq5c3a',
  ipfs: 'QmTest123',
  action: 'create',
  v: 1,
  prev: null,
  payloadSig: JSON.stringify({ sig: 'abc', key: 'def', address: 'addr1test' }),
  ts: new Date().toISOString()
};

const metadata = serializeDIDMetadata(testEvent);
console.log('Metadata label:', Object.keys(metadata)[0]);
console.log('Label value:', L_DID);
console.log('Event action:', metadata[L_DID].action);
console.log('Metadata size:', JSON.stringify(metadata).length, 'bytes');
"
# Expected:
# Metadata label: 199674
# Label value: 199674
# Event action: create
# Metadata size: < 16000 bytes
```

**Test 8: Blockfrost Provider (Real API Test)**
```bash
node -e "
const { BlockfrostProvider } = require('./packages/sdk/dist/providers/blockfrost.js');

const provider = new BlockfrostProvider(
  process.env.BLOCKFROST_PREPROD_KEY,
  'preprod'
);

(async () => {
  try {
    // This will query for any DID events on preprod
    // Should return empty array if no DIDs created yet
    const events = await provider.fetchDIDEvents('did:cardano:stake_test1any');
    console.log('✅ Blockfrost working! Events found:', events.length);
  } catch (error) {
    console.error('❌ Blockfrost error:', error.message);
  }
})();
"
# Expected: Should connect to Blockfrost (may return empty array, that's OK)
# This is a REAL test - it queries the blockchain
```

---

### ✅ Integration Test: Full SDK Import

**Test: Verify All Exports Available**
```bash
node -e "
const SDK = require('./packages/sdk/dist/index.js');

console.log('SDK Version:', SDK.SDK_VERSION);
console.log('\\nAvailable exports:');
console.log('- deriveDID:', typeof SDK.deriveDID);
console.log('- generateDIDDocument:', typeof SDK.generateDIDDocument);
console.log('- buildCreatePayload:', typeof SDK.buildCreatePayload);
console.log('- signDIDPayload:', typeof SDK.signDIDPayload);
console.log('- verifyDIDEvent:', typeof SDK.verifyDIDEvent);
console.log('- PinataClient:', typeof SDK.PinataClient);
console.log('- BlockfrostProvider:', typeof SDK.BlockfrostProvider);
console.log('- submitDIDEvent:', typeof SDK.submitDIDEvent);
console.log('- deriveStakeAddressFromBaseAddress:', typeof SDK.deriveStakeAddressFromBaseAddress);
console.log('- hexToPublicKeyMultibase:', typeof SDK.hexToPublicKeyMultibase);
console.log('- L_DID:', SDK.L_DID);
"
# Expected: All exports should be 'function' or defined values
```

---

### 📝 Test Results Template

Copy this template and fill in as you run tests:

```
## Phase 0: Monorepo Structure
- [ ] Directory structure verified
- [ ] pnpm build completes
- [ ] Package imports work
- [ ] Dashboard dev server runs

## Phase A.2: Constants & Types
- [ ] L_DID, L_VC export correctly
- [ ] Zod schemas available

## Phase A.3: Stake Derivation
- [ ] isBaseAddress() works
- [ ] deriveStakeAddressFromBaseAddress() returns stake_test1...

## Phase A.4: Key Conversion
- [ ] hexToPublicKeyMultibase() produces z6Mk... format
- [ ] Validation regex works

## Phase A.5: DID Document Generator
- [ ] deriveDID() works
- [ ] generateDIDDocument() produces W3C-compliant doc
- [ ] Public key in multibase format

## Phase A.6: Pinata Client
- [ ] Real pin test succeeds (creates CID)
- [ ] Pin verification works

## Phase A.7: Payload Builders
- [ ] buildCreatePayload() works
- [ ] buildUpdatePayload() works
- [ ] buildRevokePayload() works

## Phase A.8: Self-Verification
- [ ] Module exports available

## Phase A.9: Metadata & Tx
- [ ] serializeDIDMetadata() works
- [ ] Size validation works

## Phase C.10: Blockfrost Provider
- [ ] Real API connection works
- [ ] fetchDIDEvents() returns results

## Integration
- [ ] All SDK exports available
- [ ] No import errors
```

---

## Prerequisites (Complete Before Coding)

These are **blocking** - you cannot start P0 without them:

- [ ] **Blockfrost Account:** https://blockfrost.io/ (2 minutes)
  - Create account (GitHub/email)
  - Create **preprod project** → copy API key
  - Create **mainnet project** → copy API key
  - Add to `.env.local`:
    ```
    BLOCKFROST_PREPROD_KEY=preprod_xxxxx
    BLOCKFROST_MAINNET_KEY=mainnet_xxxxx
    ```
  - **Required for:** Transaction submission (Lucid needs provider)
  - **Free tier:** 50,000 req/day (more than enough for P0)

- [ ] **Pinata Account:** https://pinata.cloud/ (5 minutes)
  - Create account
  - Generate API key + secret
  - Add to `.env.local`:
    ```
    PINATA_API_KEY=your_api_key
    PINATA_API_SECRET=your_api_secret
    ```
  - **Required for:** IPFS pinning (DID Document storage)
  - **Free tier:** 1GB storage, 100MB uploads (plenty for P0)

- [ ] **Test Wallet:** Install at least one CIP-30 wallet
  - Eternl (recommended): https://eternl.io/
  - Lace: https://www.lace.io/
  - Nami: https://namiwallet.io/
  - Get preprod test ADA from faucet: https://docs.cardano.org/cardano-testnet/tools/faucet/

---

## Scope (P0)

### In Scope
- **DID Creation Flow (create action):** Full end-to-end on preprod/mainnet
  - Generate W3C-compliant DID Document (JSON-LD per §2.2)
  - Pin to IPFS (Pinata), get real CID
  - Build exact payload per §3.2
  - Sign with CIP-30 `signData` per §3.3.1 (exact `payloadSig` format)
  - Serialize to metadata under label 199674
  - Submit tx via Lucid, display tx hash
- **Update/Revoke Flow (design-complete):**
  - Full payload builder + signature logic
  - Provider interface for fetching `prev` tx hash
  - **Integration-gated:** Requires Blockfrost/Koios API key to test on-chain
- **Stake Address Security:**
  - Implement `deriveStakeAddressFromBaseAddress()` helper (§3.3.2)
  - Reject non-base addresses (enterprise addresses not supported in MVP)
  - Core security primitive for DID controller binding
- **Self-Verification:**
  - Implement `verifyDIDEvent()` from §3.3.2
  - Allows local validation without resolver
- **Wallet Support:**
  - Detect all `window.cardano.*` providers
  - User must explicitly pick (no default)
  - Test with Eternl, Lace, Nami
  - Graceful error if `signData` unsupported
- **Network Toggle:**
  - Switch preprod/mainnet via env flag
  - Same tx-building code for both

### Out of Scope (Later Milestones)
- Backend/resolver/indexer (no API yet)
- VC issuance/anchoring (label 199675)
- UI polish/styling
- Deployment to Vercel/Railway

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| **Real IPFS (Pinata)** | CID is required in metadata per §3.2; cannot be mocked. Pinata has simple HTTP API + free tier. |
| **Exact Spec Schemas** | Payload/signature must match §3.2 & §3.3.1 exactly for future resolver compatibility. Use zod for validation. |
| **Stake Derivation = Core Security** | Per §3.3.2, deriving stake address from signing address is the security foundation. Implement with cardano-serialization-lib. |
| **Provider Abstraction** | Design interface now; wire Blockfrost when key available. Enables update/revoke testing later. |
| **Self-Verification in SDK** | Without resolver, local verification is critical for dev/debugging. |
| **No Backend Yet** | Focus on client-side DID ops; defer indexing/API until P1. |
| **Turborepo Structure** | Supports future growth (resolver, VC flows, UI lib). Start with apps/dashboard + apps/vc-interface (stub), packages/sdk, packages/types. |

---

## Target Repo Shape (Turborepo)

```
prisma-dids/
├── apps/
│   ├── dashboard/          # DID Dashboard: universal DID management (§1.3)
│   └── vc-interface/       # VC Interface: forkable/parametrized per org (§1.3)
├── packages/
│   ├── sdk/                # Core Prisma DIDs SDK
│   │   ├── core/
│   │   │   ├── did.ts              # DID derivation (§2.1.1), doc generation (§2.2)
│   │   │   ├── payload.ts          # Payload builder (§3.2)
│   │   │   ├── signature.ts        # CIP-30 signing (§3.3.1)
│   │   │   ├── verification.ts     # Self-verification (§3.3.2)
│   │   │   └── ipfs.ts             # Pinata client (pin DID docs)
│   │   ├── providers/
│   │   │   ├── types.ts            # Provider interface (fetch prev events)
│   │   │   ├── blockfrost.ts       # Blockfrost implementation
│   │   │   └── koios.ts            # Koios stub (future)
│   │   ├── tx/
│   │   │   ├── builder.ts          # Lucid tx building
│   │   │   └── metadata.ts         # Metadata serialization
│   │   ├── utils/
│   │   │   ├── stake.ts            # Stake address derivation helper (§3.3.2)
│   │   │   └── constants.ts        # L_DID = 199674, L_VC = 199675
│   │   └── index.ts                # Public SDK exports
│   ├── types/              # Shared schemas (zod)
│   │   ├── did.ts                  # DIDEvent, PrismaPayloadSig schemas
│   │   ├── wallet.ts               # CIP-30 types
│   │   └── config.ts               # Network/provider config
│   └── (future)
│       ├── ui/                     # Shared React components
│       └── crypto/                 # VC signing, canonicalization (§5.2)
└── (future) apps/api, apps/indexer
```

> **Note:** Per v1.5 §1.3, `apps/dashboard` handles DID-only operations while `apps/vc-interface` handles VCs with org-specific parametrization. Both scaffold from day 1 to establish correct boundaries.

---

## P0 Tasks (Week 1-2)

### Phase 0: Monorepo Foundation (Day 1)

**Goal:** Establish complete turborepo architecture with all apps/packages, even if some are stubs. This ensures correct import paths, boundaries, and architecture from day 1.

#### Step 0: Complete Turborepo Setup

**Initialize Turborepo:**

```bash
npx create-turbo@latest prisma-dids
cd prisma-dids
```

**Full Monorepo Structure:**

```
prisma-dids/
├── turbo.json                    # Turborepo pipeline config
├── package.json                  # Root package.json with workspaces
├── pnpm-workspace.yaml           # pnpm workspaces config
├── .gitignore
├── README.md
├── tsconfig.json                 # Base TS config (strict mode)
├── .env.local                    # Blockfrost + Pinata keys
│
├── apps/
│   ├── dashboard/                # Next.js 14+ (P0 - Active)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.js
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   └── layout.tsx
│   │   └── public/
│   │
│   ├── api/                      # Express REST API (P1 - Stub)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts          # Stub: export const TODO_P1 = true;
│   │
│   └── indexer/                  # Blockfrost indexer (P1 - Stub)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts          # Stub
│
├── packages/
│   ├── sdk/                      # Core Prisma DIDs SDK (P0 - Active)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts          # Public exports
│   │   │   ├── core/
│   │   │   │   ├── did.ts
│   │   │   │   ├── payload.ts
│   │   │   │   ├── signature.ts
│   │   │   │   ├── verification.ts
│   │   │   │   └── ipfs.ts
│   │   │   ├── providers/
│   │   │   │   ├── types.ts
│   │   │   │   ├── blockfrost.ts
│   │   │   │   └── koios.ts
│   │   │   ├── tx/
│   │   │   │   ├── builder.ts
│   │   │   │   └── metadata.ts
│   │   │   └── utils/
│   │   │       ├── stake.ts
│   │   │       ├── keys.ts
│   │   │       └── constants.ts
│   │   └── test/
│   │       └── mocks/
│   │           └── cip30.ts
│   │
│   ├── types/                    # Shared types & schemas (P0 - Active)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── constants.ts
│   │       ├── did.ts
│   │       ├── wallet.ts
│   │       └── config.ts
│   │
│   ├── crypto/                   # VC signing, JCS (P2 - Stub)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts          # Stub: For VC canonicalization, BBS+
│   │
│   └── ui/                       # Shared React components (P3 - Stub)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.tsx         # Stub: For wallet picker, DID cards
│
└── scripts/                      # E2E test scripts
    └── test-create-did.ts
```

**Root `package.json`:**

```json
{
  "name": "prisma-dids",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check"
  },
  "devDependencies": {
    "turbo": "^1.13.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

**`turbo.json` (Pipeline Configuration):**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": []
    }
  }
}
```

**Base `tsconfig.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "exclude": ["node_modules", "dist", ".next", "build"]
}
```

**Active Package Dependencies (P0):**

**`packages/sdk/package.json`:**
```json
{
  "name": "@prisma-dids/sdk",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@prisma-dids/types": "workspace:*",
    "lucid-cardano": "^0.10.7",
    "@emurgo/cardano-serialization-lib-nodejs": "^12.0.0",
    "axios": "^1.6.0",
    "@noble/ed25519": "^2.0.0",
    "multiformats": "^13.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

**`packages/types/package.json`:**
```json
{
  "name": "@prisma-dids/types",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

**`apps/dashboard/package.json`:**
```json
{
  "name": "@prisma-dids/dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@prisma-dids/sdk": "workspace:*",
    "@prisma-dids/types": "workspace:*",
    "next": "14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "typescript": "^5.3.0",
    "eslint": "^8.0.0",
    "eslint-config-next": "14.1.0"
  }
}
```

**Stub Packages (P1-P3):**

All stub packages get minimal `package.json`:

```json
{
  "name": "@prisma-dids/api",  // or crypto, ui, indexer, etc.
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@prisma-dids/types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

And stub `src/index.ts`:

```typescript
// TODO: Implement in P1/P2/P3
export const STUB_PACKAGE = true;
```

**Setup Commands:**

```bash
# 1. Initialize turborepo
npx create-turbo@latest prisma-dids --package-manager pnpm

# 2. Create all directories
mkdir -p apps/{dashboard,vc-interface,api,indexer}
mkdir -p packages/{sdk,types,crypto,ui}/{src,test}
mkdir -p packages/sdk/src/{core,providers,tx,utils}
mkdir -p packages/sdk/test/mocks
mkdir -p scripts

# 3. Create all package.json files (copy from above)
# 4. Create stub index files for P1-P3 packages
echo "export const STUB_PACKAGE = true;" > packages/crypto/src/index.ts
echo "export const STUB_PACKAGE = true;" > packages/ui/src/index.tsx
echo "export const STUB_PACKAGE = true;" > apps/api/src/index.ts
echo "export const STUB_PACKAGE = true;" > apps/indexer/src/index.ts
echo "export const STUB_PACKAGE = true;" > apps/vc-interface/src/index.ts

# 5. Install all dependencies
pnpm install

# 6. Build to verify structure
pnpm build

# 7. Start dashboard dev server
pnpm --filter @prisma-dids/dashboard dev
```

**Verification Checklist:**

- [ ] `pnpm install` completes without errors
- [ ] `pnpm build` builds all packages (stubs just compile empty exports)
- [ ] Dashboard runs on `localhost:3000`
- [ ] TypeScript resolves imports: `import { L_DID } from '@prisma-dids/types'`
- [ ] All package boundaries are clear
- [ ] `.env.local` exists with Blockfrost + Pinata keys

**Acceptance Criteria:**

✅ Complete monorepo structure exists
✅ All apps/packages have `package.json` and stub files
✅ Turborepo pipeline configured
✅ TypeScript strict mode across all packages
✅ Dashboard runs (even if empty)
✅ SDK builds with correct internal structure
✅ Import paths work: `@prisma-dids/sdk`, `@prisma-dids/types`
✅ Future packages stubbed (no surprises later)

---

### Phase A: Core DID Creation (Week 1)

#### 1. Implement SDK Core Modules

**Now that the monorepo is set up, implement the actual code in `packages/sdk` and `packages/types`:**

**File: `types/src/constants.ts`**
```typescript
export const L_DID = 199674;  // Prisma DID events (§3.1)
export const L_VC = 199675;   // Prisma VC anchors (§6.1)
export const NETWORK = {
  PREPROD: 0,
  MAINNET: 1
} as const;
```

**File: `types/src/did.ts`**
```typescript
import { z } from 'zod';

// Exact payload per §3.2
export const DidEventPayloadSchema = z.object({
  id: z.string().startsWith('did:cardano:stake1'),
  ipfs: z.string().startsWith('Qm'),
  action: z.enum(['create', 'update', 'revoke']),
  v: z.number().int().positive(),
  prev: z.string().nullable(),
});

// Exact payloadSig per §3.3.1
export const PrismaPayloadSigSchema = z.object({
  sig: z.string().regex(/^[0-9a-f]+$/i),  // hex Ed25519 signature
  key: z.string().regex(/^[0-9a-f]+$/i),  // hex Ed25519 public key
  address: z.string().regex(/^addr1/),    // bech32 base address
});

// Full event (what goes in metadata)
export const DIDEventSchema = DidEventPayloadSchema.extend({
  payloadSig: z.string(),  // JSON.stringify(PrismaPayloadSig)
  ts: z.string().datetime(),
});

export type DidEventPayload = z.infer<typeof DidEventPayloadSchema>;
export type PrismaPayloadSig = z.infer<typeof PrismaPayloadSigSchema>;
export type DIDEvent = z.infer<typeof DIDEventSchema>;
```

**File: `types/src/wallet.ts`**
```typescript
// CIP-30 minimal types
export interface CIP30API {
  getNetworkId(): Promise<number>;
  getRewardAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  signData(address: string, payload: string): Promise<{ signature: string; key: string }>;
}

export interface CardanoProvider {
  name: string;
  icon: string;
  enable(): Promise<CIP30API>;
}
```

**Acceptance:** All schemas export cleanly, validate sample data

---

#### 3. Stake Derivation Helper (`packages/sdk`)

**File: `sdk/src/utils/stake.ts`**

Implement `deriveStakeAddressFromBaseAddress()` per §3.3.2:

```typescript
import { Address, BaseAddress, RewardAddress } from '@emurgo/cardano-serialization-lib-nodejs';

/**
 * Derives stake address (stake1...) from a base address (addr1...).
 * This is the core security binding for DID controller verification.
 * Per §3.3.2 of TECHNICAL_DESIGN v1.3.1.
 */
export function deriveStakeAddressFromBaseAddress(addressBech32: string): string {
  const addr = Address.from_bech32(addressBech32);
  const base = BaseAddress.from_address(addr);

  if (!base) {
    throw new Error('Expected base address (addr1...) for DID operations. Enterprise addresses not supported.');
  }

  const stakeCred = base.stake_cred();
  const networkId = base.to_address().network_id();
  const rewardAddr = RewardAddress.new(networkId, stakeCred);

  // Use correct prefix based on network
  // networkId: 0 = preprod/testnet, 1 = mainnet
  // NOTE: If adding other networks (e.g. sanchonet), extend this logic
  const prefix = networkId === 1 ? 'stake' : 'stake_test';
  return rewardAddr.to_address().to_bech32(prefix);
}

/**
 * Validates that an address is a base address (not enterprise).
 */
export function isBaseAddress(addressBech32: string): boolean {
  try {
    const addr = Address.from_bech32(addressBech32);
    return BaseAddress.from_address(addr) !== undefined;
  } catch {
    return false;
  }
}
```

**Tests (`sdk/src/utils/stake.test.ts`):**
- Valid base address → correct stake address
- Enterprise address → throws error
- Invalid bech32 → throws error
- Mainnet vs preprod prefix handling

**Acceptance:** Tests pass; function returns correct stake addresses

---

#### 4. Key Format Conversion (`packages/sdk`)

**File: `sdk/src/utils/keys.ts`**

CIP-30 wallets return hex public keys, but W3C DID Documents require multibase format (z6Mk...).

```typescript
import { base58btc } from 'multiformats/bases/base58';

/**
 * Converts hex Ed25519 public key (CIP-30 format) to publicKeyMultibase (z6Mk...)
 * Per W3C Ed25519VerificationKey2020 specification
 */
export function hexToPublicKeyMultibase(hexKey: string): string {
  // Ed25519 public keys are 32 bytes
  const keyBytes = Buffer.from(hexKey, 'hex');

  if (keyBytes.length !== 32) {
    throw new Error('Invalid Ed25519 public key: expected 32 bytes');
  }

  // Multicodec prefix for Ed25519 public key: 0xed01
  const multicodecPrefix = Buffer.from([0xed, 0x01]);
  const multicodecKey = Buffer.concat([multicodecPrefix, keyBytes]);

  // Base58-btc encode with 'z' prefix (multibase indicator)
  const base58Encoded = base58btc.encode(multicodecKey);
  const result = 'z' + base58Encoded;

  // Validate result before returning (fail fast)
  if (!isValidPublicKeyMultibase(result)) {
    throw new Error('Generated invalid multibase key');
  }

  return result;
}

/**
 * Validates that a string is a valid Ed25519 multibase public key
 */
export function isValidPublicKeyMultibase(key: string): boolean {
  return /^z[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(key);
}
```

**Tests (`sdk/src/utils/keys.test.ts`):**
- Valid 32-byte hex key → valid z6Mk... format
- Invalid hex length → throws error
- Generated keys pass validation regex
- Round-trip conversion consistency

**Acceptance:** Tests pass; keys match W3C format exactly

---

#### 5. DID Document Generator (`packages/sdk`)

**File: `sdk/src/core/did.ts`**

```typescript
import type { DIDDocument } from '../types';
import { hexToPublicKeyMultibase } from '../utils/keys';

/**
 * Derives DID from stake address per §2.1.1
 */
export function deriveDID(stakeAddress: string): string {
  if (!stakeAddress.startsWith('stake1') && !stakeAddress.startsWith('stake_test1')) {
    throw new Error('Invalid stake address format');
  }
  return `did:cardano:${stakeAddress}`;
}

/**
 * Generates W3C-compliant DID Document per §2.2
 * Converts hex public key from wallet to multibase format automatically
 */
export function generateDIDDocument(params: {
  did: string;
  publicKeyHex: string;  // Ed25519 hex key from CIP-30 wallet
  serviceEndpoint?: string;
}): DIDDocument {
  // Convert hex key to multibase (z6Mk... format)
  const publicKeyMultibase = hexToPublicKeyMultibase(params.publicKeyHex);

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ],
    id: params.did,
    verificationMethod: [
      {
        id: `${params.did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: params.did,
        publicKeyMultibase
      }
    ],
    authentication: [`${params.did}#key-1`],
    service: params.serviceEndpoint ? [
      {
        id: `${params.did}#prisma-api`,
        type: 'PrismaContributionService',
        serviceEndpoint: params.serviceEndpoint
      }
    ] : []
  };
}
```

**Acceptance:** Generated docs match §2.2 exactly; valid JSON-LD; keys in z6Mk... format

---

#### 6. Pinata Client (`packages/sdk`)

**File: `sdk/src/core/ipfs.ts`**

```typescript
import axios from 'axios';

export interface PinataConfig {
  apiKey: string;
  apiSecret: string;
}

export class PinataClient {
  constructor(private config: PinataConfig) {}

  async pinJSON(data: object): Promise<string> {
    try {
      const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinJSONToIPFS',
        data,
        {
          headers: {
            'pinata_api_key': this.config.apiKey,
            'pinata_secret_api_key': this.config.apiSecret
          },
          timeout: 30000  // 30s timeout
        }
      );
      return response.data.IpfsHash;  // Returns CID (Qm...)
    } catch (error) {
      throw new Error(`Pinata pinning failed: ${error.message}`);
    }
  }

  async pin(cid: string): Promise<void> {
    // Optional: verify pin exists
    await axios.get(`https://gateway.pinata.cloud/ipfs/${cid}`, { timeout: 10000 });
  }
}
```

**Error Handling:**
- Network failures → retry with exponential backoff (3 attempts)
- Auth errors → fail fast with clear message
- Rate limits → surface to user

**Acceptance:** Can pin JSON, get back valid CID, fetch via gateway

---

#### 7. Payload Builder & Signature (`packages/sdk`)

**File: `sdk/src/core/payload.ts`**

```typescript
import type { DidEventPayload, DIDEvent } from '@prisma-dids/types';

export function buildCreatePayload(params: {
  did: string;
  ipfsCid: string;
}): DidEventPayload {
  return {
    id: params.did,
    ipfs: params.ipfsCid,
    action: 'create',
    v: 1,
    prev: null
  };
}

export function buildUpdatePayload(params: {
  did: string;
  ipfsCid: string;
  prevTxHash: string;
  version: number;
}): DidEventPayload {
  return {
    id: params.did,
    ipfs: params.ipfsCid,
    action: 'update',
    v: params.version,
    prev: params.prevTxHash
  };
}

export function buildRevokePayload(params: {
  did: string;
  ipfsCid: string;  // CID of DID doc with status: "revoked"
  prevTxHash: string;
  version: number;
}): DidEventPayload {
  return {
    id: params.did,
    ipfs: params.ipfsCid,
    action: 'revoke',
    v: params.version,
    prev: params.prevTxHash
  };
}
```

**File: `sdk/src/core/signature.ts`**

```typescript
import type { CIP30API, DidEventPayload, PrismaPayloadSig, DIDEvent } from '@prisma-dids/types';

/**
 * Signs a DID event payload using CIP-30 wallet per §3.3.1
 *
 * IMPORTANT: CIP-30 wallets expect hex-encoded payloads for signData.
 * We sign UTF-8 bytes encoded as hex, then verify against UTF-8 bytes.
 */
export async function signDIDPayload(
  wallet: CIP30API,
  payload: DidEventPayload,
  signingAddress: string  // base address (addr1...)
): Promise<PrismaPayloadSig> {
  // 1. Serialize payload deterministically
  const payloadStr = JSON.stringify(payload);

  // 2. Encode as hex for CIP-30 compatibility
  //    Most wallets expect hex-encoded data for signData
  const payloadHex = Buffer.from(payloadStr, 'utf8').toString('hex');

  // 3. Sign with CIP-30
  const { signature, key } = await wallet.signData(signingAddress, payloadHex);

  // 4. Return exact format per §3.3.1
  return {
    sig: signature,
    key,
    address: signingAddress
  };
}

/**
 * Constructs final DIDEvent for metadata
 */
export function buildDIDEvent(
  payload: DidEventPayload,
  payloadSig: PrismaPayloadSig
): DIDEvent {
  return {
    ...payload,
    payloadSig: JSON.stringify(payloadSig),
    ts: new Date().toISOString()
  };
}
```

**Note:** See SDK README for detailed explanation of CIP-30 payload encoding.

**Acceptance:** CIP-30 mock returns valid signature; schemas validate; hex encoding works

---

#### 8. Self-Verification (`packages/sdk`)

**File: `sdk/src/core/verification.ts`**

```typescript
import { ed25519 } from '@noble/ed25519';
import { deriveStakeAddressFromBaseAddress } from '../utils/stake';
import type { DIDEvent, DidEventPayload, PrismaPayloadSig } from '@prisma-dids/types';

/**
 * Verifies a DID event per §3.3.2
 * Returns true if signature is valid and controller matches DID
 *
 * IMPORTANT: Verification uses UTF-8 bytes, not hex.
 * Even though wallets sign hex-encoded data, the signature is over UTF-8 bytes.
 */
export async function verifyDIDEvent(event: DIDEvent): Promise<boolean> {
  try {
    // 1. Parse payloadSig
    const payloadSig: PrismaPayloadSig = JSON.parse(event.payloadSig);

    // 2. Reconstruct payload (must match what was signed)
    const payload: DidEventPayload = {
      id: event.id,
      ipfs: event.ipfs,
      action: event.action,
      v: event.v,
      prev: event.prev
    };
    const payloadStr = JSON.stringify(payload);

    // 3. Verify Ed25519 signature
    //    Note: Verify against UTF-8 bytes (what was actually signed)
    //    Even though signData received hex, it signs the underlying bytes
    const message = Buffer.from(payloadStr, 'utf8');
    const sigBytes = Buffer.from(payloadSig.sig, 'hex');
    const keyBytes = Buffer.from(payloadSig.key, 'hex');
    const validSig = await ed25519.verify(sigBytes, message, keyBytes);

    if (!validSig) return false;

    // 4. Extract stake address from DID
    const stakeAddressFromDid = event.id.replace('did:cardano:', '');

    // 5. Derive stake address from signing address
    const stakeAddressFromSigningAddress = deriveStakeAddressFromBaseAddress(payloadSig.address);

    // 6. Compare controller
    return stakeAddressFromDid === stakeAddressFromSigningAddress;

  } catch (error) {
    console.error('Verification failed:', error);
    return false;
  }
}
```

**Tests:**
- Valid event → true
- Tampered payload → false
- Mismatched stake address → false
- Invalid signature → false
- Hex vs UTF-8 consistency check

**Acceptance:** All tests pass; can verify own events locally

---

#### 9. Metadata Serialization & Tx Builder (`packages/sdk`)

**File: `sdk/src/tx/metadata.ts`**

```typescript
import { L_DID } from '@prisma-dids/types';
import type { DIDEvent } from '@prisma-dids/types';

const MAX_METADATA_SIZE = 16000;  // ~16KB limit per §3.2.1

/**
 * Serializes DIDEvent to Cardano metadata format
 */
export function serializeDIDMetadata(event: DIDEvent): Record<string, any> {
  const metadata = {
    [L_DID]: event
  };

  // Size check
  const serialized = JSON.stringify(metadata);
  if (serialized.length > MAX_METADATA_SIZE) {
    throw new Error(`Metadata exceeds ${MAX_METADATA_SIZE} bytes: ${serialized.length}`);
  }

  return metadata;
}
```

**File: `sdk/src/tx/builder.ts`**

```typescript
import { Lucid, Blockfrost } from 'lucid-cardano';
import { L_DID } from '@prisma-dids/types';
import { serializeDIDMetadata } from './metadata';
import type { DIDEvent } from '@prisma-dids/types';

export interface NetworkConfig {
  network: 'Preprod' | 'Mainnet';
  blockfrostApiKey: string;  // Required for tx submission
}

export async function submitDIDEvent(
  wallet: any,  // CIP-30 wallet
  event: DIDEvent,
  config: NetworkConfig
): Promise<string> {
  if (!config.blockfrostApiKey) {
    throw new Error('Blockfrost API key required for transaction submission');
  }

  // Initialize Lucid with Blockfrost provider
  const lucid = await Lucid.new(
    new Blockfrost(
      `https://cardano-${config.network.toLowerCase()}.blockfrost.io/api/v0`,
      config.blockfrostApiKey
    ),
    config.network
  );

  lucid.selectWallet(wallet);

  // Build tx with metadata (use constant)
  const metadata = serializeDIDMetadata(event);
  const tx = await lucid
    .newTx()
    .attachMetadata(L_DID, metadata[L_DID])
    .complete();

  const signedTx = await tx.sign().complete();
  const txHash = await signedTx.submit();

  return txHash;
}
```

**Acceptance:** Can build tx, serialize metadata correctly; size check works

---

### Phase B: Dashboard UI (Week 1)

**File: `apps/dashboard/app/page.tsx`**

**Features:**
1. **Wallet Detection:**
   - Scan `window.cardano.*`
   - List all detected wallets with icons
   - User must explicitly pick (no auto-connect)
   - Show error if no wallets found

2. **Network Selector:**
   - Toggle preprod/mainnet (env var default)
   - Show current network clearly

3. **Create DID Flow:**
   - Button: "Create DID"
   - Flow:
     1. Get reward addresses from wallet
     2. Derive DID from stake address
     3. Generate DID Document with wallet's pub key
     4. Pin to Pinata (show loading state)
     5. Build payload with CID
     6. Sign with wallet (CIP-30 signData)
     7. Self-verify locally
     8. Submit tx
     9. Show tx hash + link to explorer

4. **Error Handling:**
   - Wallet doesn't support `signData` → show "Wallet not supported. Please use Eternl, Lace, or Nami."
   - Pinata fails → retry with feedback
   - Tx fails → show Lucid error
   - Non-base address → explain stake key requirement

**Acceptance:** Can create DID on preprod, see tx on explorer, verify locally

---

### Phase C: Update/Revoke Design (Week 2)

**Note:** Blockfrost key available from Prerequisites - can implement update/revoke fully in P0.

#### 10. Provider Interface (`packages/sdk`)

**File: `sdk/src/providers/types.ts`**

```typescript
export interface DIDEventRecord {
  txHash: string;
  event: DIDEvent;
  blockHeight: number;
  timestamp: string;
}

export interface ChainProvider {
  /**
   * Fetches all DID events for a specific DID from metadata label 199674
   */
  fetchDIDEvents(did: string): Promise<DIDEventRecord[]>;

  /**
   * Gets the latest valid event for a DID
   */
  getLatestDIDEvent(did: string): Promise<DIDEventRecord | null>;
}
```

**File: `sdk/src/providers/blockfrost.ts`**

```typescript
import axios from 'axios';
import { L_DID } from '@prisma-dids/types';
import type { ChainProvider, DIDEventRecord } from './types';

export class BlockfrostProvider implements ChainProvider {
  constructor(
    private apiKey: string,
    private network: 'preprod' | 'mainnet'
  ) {}

  async fetchDIDEvents(did: string): Promise<DIDEventRecord[]> {
    const baseUrl = `https://cardano-${this.network}.blockfrost.io/api/v0`;

    // Query metadata by label
    // NOTE: Blockfrost returns max 100 results per call
    // TODO: Add pagination if a single DID exceeds 100 events (unlikely in P0)
    //       Use the 'page' parameter: { count: 100, page: 2, order: 'asc' }
    //       This will fail silently for DIDs with 100+ updates; acceptable for MVP
    const response = await axios.get(
      `${baseUrl}/metadata/txs/labels/${L_DID}`,
      {
        headers: { project_id: this.apiKey },
        params: { count: 100, order: 'asc' }
      }
    );

    // TODO: Add explicit warning if we hit the 100-event limit
    //       if (response.data.length === 100) {
    //         console.warn(`DID ${did} may have more than 100 events; results truncated`);
    //       }

    // Filter for this DID
    const events = response.data
      .filter((tx: any) => {
        const metadata = tx.json_metadata?.[L_DID];
        return metadata?.id === did;
      })
      .map((tx: any) => ({
        txHash: tx.tx_hash,
        event: tx.json_metadata[L_DID],
        blockHeight: tx.block_height,
        timestamp: tx.block_time
      }));

    return events;
  }

  async getLatestDIDEvent(did: string): Promise<DIDEventRecord | null> {
    const events = await this.fetchDIDEvents(did);
    if (events.length === 0) return null;

    // Return highest version (assumes events are sorted)
    return events.reduce((latest, current) =>
      current.event.v > latest.event.v ? current : latest
    );
  }
}
```

**File: `sdk/src/providers/koios.ts`**

Stub for future:

```typescript
export class KoiosProvider implements ChainProvider {
  constructor(private network: 'preprod' | 'mainnet') {}

  async fetchDIDEvents(did: string): Promise<DIDEventRecord[]> {
    throw new Error('Koios provider not yet implemented');
  }

  async getLatestDIDEvent(did: string): Promise<DIDEventRecord | null> {
    throw new Error('Koios provider not yet implemented');
  }
}
```

**Acceptance:** Interface implemented; Blockfrost client works with real API key

---

#### 11. Update/Revoke Payload Builders

Already implemented in step 6 (`buildUpdatePayload`, `buildRevokePayload`).

**Dashboard UI:**
- "Update DID" button → fetch latest event via provider, increment version
- "Revoke DID" button → fetch latest, set action=revoke, update DID doc with `status: "revoked"`

**Acceptance:** Payload builders work; UI wired with Blockfrost provider

---

### Phase D: Testing & Documentation (Week 2)

#### 12. Unit Tests

**Shared Test Utilities:**

Create `packages/sdk/test/mocks/cip30.ts` for reusable CIP-30 mock:

```typescript
import { ed25519 } from '@noble/ed25519';

// Deterministic test keypair for verification tests
const TEST_PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
const TEST_PUBLIC_KEY = '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29'; // Derived from above

export const mockCIP30Wallet = {
  getNetworkId: () => Promise.resolve(0), // preprod
  getRewardAddresses: () => Promise.resolve(['stake_test1uqevw7fgvjna3ty89hxvp72gytmm8lf8qmx6rpshfmgc2cclq5c3a']),
  getChangeAddress: () => Promise.resolve('addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp'),
  getUsedAddresses: () => Promise.resolve(['addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp']),

  // Sign with deterministic key for verification tests
  signData: async (address: string, payloadHex: string) => {
    const message = Buffer.from(payloadHex, 'hex'); // Hex payload from signDIDPayload
    const privKeyBytes = Buffer.from(TEST_PRIVATE_KEY, 'hex');
    const signature = await ed25519.sign(message, privKeyBytes);

    return {
      signature: Buffer.from(signature).toString('hex'),
      key: TEST_PUBLIC_KEY
    };
  }
};

// Export for verification tests that need to check against known values
export const TEST_STAKE_ADDRESS = 'stake_test1uqevw7fgvjna3ty89hxvp72gytmm8lf8qmx6rpshfmgc2cclq5c3a';
export const TEST_BASE_ADDRESS = 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
```

**Note:** This mock produces real Ed25519 signatures that pass verification, enabling true positive/negative testing.

**Coverage:**
- `keys.test.ts`: Hex to multibase conversion, validation
- `stake.test.ts`: Stake derivation, base address validation
- `payload.test.ts`: Create/update/revoke payload builders, schema validation
- `signature.test.ts`: Hex encoding, CIP-30 compatibility (use shared mock)
- `verification.test.ts`: Ed25519 signature verification, controller matching, hex vs UTF-8 (use shared mock)
- `metadata.test.ts`: Serialization, size checks

**Tools:** Vitest or Jest

**Acceptance:** >80% coverage, all tests pass, shared mock prevents duplication

---

#### 13. E2E Test (Manual for P0)

**Script: `scripts/test-create-did.ts`**

```typescript
// 1. Connect to wallet (or use test keys)
// 2. Generate DID doc with key conversion
// 3. Pin to Pinata
// 4. Build & sign payload (with hex encoding)
// 5. Self-verify
// 6. Submit to preprod
// 7. Query back via Blockfrost
// 8. Verify retrieved event matches submitted event
// 9. Test update flow (fetch prev, increment version)
// 10. Test revoke flow
```

**Acceptance:** Full create → update → revoke flow works on preprod

---

#### 14. Documentation

**File: `packages/sdk/README.md`**

**Sections:**
- Overview: Prisma DIDs SDK per TECHNICAL_DESIGN v1.3.1
- Installation (pnpm/npm, peer deps)
- Prerequisites (Blockfrost API key - see root Prerequisites section)
- Quick Start (create DID example with key conversion)
- API Reference (all exported functions)
- Signature Scheme (explain §3.3.1 payloadSig format)
- **CIP-30 Payload Encoding** (critical one-liner: "Payloads are hex-encoded for signData, verified as UTF-8")
- Key Format Conversion (hex → multibase for DID Documents)
- Security Model (stake derivation, Ed25519)
- Provider Interface (Blockfrost/Koios)
- Error Handling (wallet not supported, Pinata failures, tx errors)
- Testing (unit tests with shared mock)

**File: `apps/dashboard/README.md`**

**Sections:**
- Setup (env vars: PINATA_API_KEY, network selection)
- Wallet Support (CIP-30 requirements)
- Usage (create/update/revoke flows)
- Troubleshooting (common wallet/network errors)

**Acceptance:** Documentation is clear, code examples run

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Spec Compliance** | Events won't be resolvable by future resolver | Use zod schemas per §3.2 & §3.3.1; add self-verification to catch deviations early |
| **Wallet Compatibility** | Some CIP-30 wallets don't support `signData` | Test with Eternl, Lace, Nami; show "Wallet not supported" message; document compatible wallets |
| **IPFS Availability** | Pinata API can fail/rate-limit | Retry logic (3 attempts, exponential backoff); clear error messages |
| **Metadata Size** | Events exceed 16KB | Pre-flight size check; fail early with clear message |
| **Stake Derivation Edge Cases** | Enterprise addresses, multi-sig, etc. | Validate address type; reject unsupported types with clear error |
| **Provider Pagination** | Single DID exceeds 100 events | Note in code; defer pagination to post-P0 (unlikely for MVP) |
| **Signature Format** | CIP-30 implementations vary | Log raw signature/key values during dev; add debug mode; compare with spec exactly |

---

## Acceptance Criteria (P0 Complete)

**Prerequisites:**
- [ ] Blockfrost account created (preprod + mainnet keys)
- [ ] Pinata account created (API keys)
- [ ] Test wallet installed with preprod ADA

**Core Functionality:**
- [ ] User can connect any CIP-30 wallet (Eternl, Lace, Nami tested)
- [ ] User can toggle preprod/mainnet
- [ ] User can **create a DID:**
  - [ ] Public key converted hex → multibase (z6Mk...)
  - [ ] DID Document generated per §2.2 with correct key format
  - [ ] Pinned to Pinata, CID returned
  - [ ] Payload built per §3.2
  - [ ] Signed per §3.3.1 with hex encoding (exact `payloadSig` format)
  - [ ] Self-verified locally (passes §3.3.2 checks)
  - [ ] Tx submitted to preprod/mainnet via Blockfrost
  - [ ] Tx hash displayed + link to explorer
- [ ] User can **update a DID:**
  - [ ] Blockfrost fetches previous event
  - [ ] Version incremented, prev hash set
  - [ ] New DID Document pinned
  - [ ] Tx submitted successfully
- [ ] User can **revoke a DID:**
  - [ ] Blockfrost fetches latest event
  - [ ] DID Document updated with `status: "revoked"`
  - [ ] Revoke event submitted

**Quality:**
- [ ] Unit tests pass (>80% coverage, including key conversion)
- [ ] E2E test script: full create → update → revoke flow on preprod
- [ ] Documentation complete (SDK + dashboard READMEs with CIP-30 encoding notes)

---

## Next Milestones (Post-P0)

### P1: Resolver & Indexer (Week 3-4)

**Database Schema (per TECHNICAL_DESIGN v1.4 §7.1):**

| Table | Key Fields |
|-------|------------|
| `did_events` | did, tx_hash, action, version, prev_tx_hash, ipfs_cid, valid, block_height, timestamp |
| `vc_events` | tx_hash, event, issuer_did, holder_did, validator_did, **vc_hash** (jti for SD-JWT, SHA-256 for Ed25519), vc_type, **vc_format**, **reason**, block_height, timestamp |

**Tasks:**
- PostgreSQL schema with v1.4 fields (vc_format, reason, validator_did)
- Indexer worker (subscribes to Blockfrost webhooks or polls for L_DID + L_VC)
- REST API per v1.4 §7.2:
  - `GET /did/:did` → Latest valid DID Document + metadata
  - `GET /did/:did/history` → Full valid event chain
  - **`GET /vc/:vcHash/status`** → Current status (active/revoked)
  - `GET /issuer/:did/credentials` → All VCs issued by DID
  - `GET /holder/:did/credentials` → All VCs held by DID
- Wire provider to dashboard (enable update/revoke flows)
- Deploy to Railway

### P2: VC Issuance & Anchoring with SD-JWT (Week 5-6)

**New in v1.4:** SD-JWT selective disclosure replaces UI-level disclosure with cryptographic privacy.

#### Phase 2A: SDK VC Functions

**Dependencies to add:**
```bash
pnpm add @sd-jwt/sd-jwt-vc@^0.17.0 @sd-jwt/crypto-nodejs@^0.17.0 jose@^5.0.0
```

> **Note:** The `@sd-jwt/*` packages are pre-1.0. Pin to specific versions and test upgrades carefully.

**File: `packages/sdk/src/vc/sdjwt.ts`**

| Task | Description | Status |
|------|-------------|--------|
| 2A.1 | `issueSDJwtVC()` - Issue credential with disclosable claims (§5.3.3) | Pending |
| 2A.2 | `createPresentation()` - Holder selects claims to reveal (§5.3.4) | Pending |
| 2A.3 | `verifyPresentation()` - Verify SD-JWT + check issuer DID (§5.3.5) | Pending |
| 2A.4 | `getDisclosableClaims()` - List available claims for UI | Pending |

**File: `packages/sdk/src/vc/revocation.ts`**

| Task | Description | Status |
|------|-------------|--------|
| 2A.5 | `revokeVC()` - Submit revocation event under L_VC (§6.4.2) | Pending |
| 2A.6 | `checkRevocationStatus()` - Query chain for revocation events | Pending |

#### Phase 2B: VC Anchoring

| Task | Description | Status |
|------|-------------|--------|
| 2B.1 | VC anchor schema with `vcFormat` field (§6.1) | Pending |
| 2B.2 | `anchorVCIssuance()` - Submit issuance event | Pending |
| 2B.3 | `anchorVCValidation()` - Submit validation event | Pending |
| 2B.4 | Blockfrost provider: `fetchVCEvents()` for L_VC label | Pending |

#### Phase 2C: VC Interface UI

| Task | Description | Status |
|------|-------------|--------|
| 2C.1 | VC issuance form (issuer picks disclosable fields) | Pending |
| 2C.2 | VC inbox (holder views received credentials) | Pending |
| 2C.3 | Claim selector UI (checkboxes for selective disclosure) | Pending |
| 2C.4 | Share/present VC flow (generate presentation) | Pending |
| 2C.5 | VC revocation UI (issuer revokes with reason) | Pending |

#### Phase 2D: Testing

| Task | Description | Status |
|------|-------------|--------|
| 2D.1 | Unit tests for SD-JWT issue/present/verify | Pending |
| 2D.2 | Unit tests for VC revocation flow | Pending |
| 2D.3 | E2E test: issue → present (partial) → verify | Pending |
| 2D.4 | E2E test: issue → revoke → verify (should fail) | Pending |
| 2D.5 | **jti hash strategy test:** verify revocation check works from any presentation (partial or full) without disclosures | Pending |

**Acceptance Criteria (P2 Complete):**
- [ ] Issuer can create SD-JWT VC with `jti` claim (required)
- [ ] Holder can select which claims to reveal in presentation
- [ ] Verifier can verify presentation and check revocation status
- [ ] **Revocation works from any presentation** (partial or full) using jti, not full SD-JWT hash
- [ ] VC anchoring events submitted under L_VC (199675) with jti as vcHash
- [ ] Dashboard shows claim selection UI with checkboxes
- [ ] Revoked VCs fail verification with clear error

### P3: Polish & Pilots (Week 7-8)
- UI/UX improvements (claim selector, VC inbox polish)
- Wallet error handling refinements
- Deploy dashboard to Vercel
- ALJ pilot deployment & feedback
- Documentation: SDK VC usage guide, holder/issuer/verifier flows

### Future: BBS+ & Advanced ZK (Post-MVP)
Per TECHNICAL_DESIGN v1.4 §11.4, after SD-JWT proves out:
- Evaluate BLS12-381 library options (pairing-plus, noble-curves)
- Implement `issueBBSVC()` with unlinkable presentations
- Add `vcFormat: "bbs"` support to anchoring schema
- Dual-format retrocompatibility (SD-JWT + BBS+ coexistence)

---

## Open Action Items

- [ ] **CIP-10 Label Registration:** Start PR to register labels 199674 & 199675 (parallel to P0 dev)
  - Fork https://github.com/cardano-foundation/CIPs
  - Add entries to `CIP-0010/registry.json`
  - Submit PR with Prisma DIDs metadata schema
- [ ] **Explorer Links:** Document Cardanoscan/Cexplorer URL formats for preprod/mainnet
  - Preprod: `https://preprod.cardanoscan.io/transaction/{txHash}`
  - Mainnet: `https://cardanoscan.io/transaction/{txHash}`
- [ ] **Wallet Feature Detection:** Test signData support across wallets
  - Create compatibility matrix (Eternl, Lace, Nami, Flint, etc.)
  - Document any wallet-specific quirks

---

**Plan Version:** 1.6.2
**Aligned with:** TECHNICAL_DESIGN v1.6.2
**Last Updated:** 2025-12-17
**Status:** Create DID tested on Preprod; Update/Revoke code complete, awaiting test; Forkability architecture defined

**v1.6.2 Changes (Forkability & Single Indexer Architecture):**
- **Single Indexer Codebase:** Clarified that DID Indexer and VC Indexer are ONE codebase with different configs
- **Dependency Graph:** Added visual diagram showing package/app dependencies
- **P1 Restructured:** Now "Configurable Indexer + DID Config" (8 tasks)
- **P2a Expanded:** Added `packages/schemas` for extensible credential types (14 tasks)
- **P2b Expanded:** Added forkability infrastructure (env templates, example configs) (16 tasks)
- **P3 Expanded:** Added detailed fork documentation guides (14 tasks)
- **Target Structure:** Updated to show single `apps/indexer/` with config-driven behavior
- **Total Tasks:** 64 → 81 (added 17 tasks for forkability)

**v1.6.1.0 Changes (SD-JWT & VC Revocation Roadmap):**
- **P2 Expansion:** Detailed SD-JWT integration tasks aligned with TECHNICAL_DESIGN v1.4
- **SDK VC Functions:** Added tasks for `issueSDJwtVC()`, `createPresentation()`, `verifyPresentation()`
- **VC Revocation:** Added `revokeVC()`, `checkRevocationStatus()` task definitions
- **VC Anchoring:** Added `vcFormat` field support, issuance/validation event anchoring
- **VC Interface UI:** Added claim selector, VC inbox, and revocation UI tasks
- **Testing:** Added E2E test scenarios for SD-JWT and revocation flows
- **Dependencies:** Documented `@sd-jwt/sd-jwt-vc` and `@sd-jwt/crypto-nodejs` requirements

**v1.5.0 Changes (Full Blockchain Integration):**
- **Create DID:** ✅ Successfully tested on Cardano Preprod with real tx submission
- **Update/Revoke DID:** Code complete, awaiting manual testing
- **Metadata Chunking:** Implemented 64-byte string chunking for Cardano metadata compliance
- **Null Handling:** Converted null values to empty strings for Cardano metadata
- **DID Lookup:** Added chunked metadata reconstruction in API route
- **Tx Submission:** All three operations (create/update/revoke) wired with Lucid + Blockfrost
- **Pinata JWT:** Added JWT authentication support alongside API key/secret

**v1.4.0 Changes (Monorepo Foundation):**
- **NEW: Phase 0** - Complete turborepo setup with all apps/packages structure
- Establishes full architecture upfront (apps: dashboard, api, indexer; packages: sdk, types, crypto, ui)
- Stub packages for P1-P3 (no surprises, correct boundaries from day 1)
- Detailed turbo.json pipeline, package.json configs, folder structure
- Clear distinction between P0 active packages and future stubs
- Setup commands and verification checklist
- Total tasks: 19 (was 18)

**v1.3.1 Changes (Micro-refinements):**
- Network ID clarification in stake derivation (preprod=0, mainnet=1, note for future networks)
- Deterministic CIP-30 mock with real Ed25519 signatures (enables true verification tests)
- Explicit pagination failure note in Blockfrost provider (silent truncation at 100 events)

**v1.3 Changes:**
- Added fail-fast validation in `hexToPublicKeyMultibase`
- Added Blockfrost pagination note (100-item limit)
- Improved wallet error handling ("Wallet not supported" message)
- Added shared CIP-30 mock for tests (avoid duplication)
- Reduced repetition (Blockfrost requirement in Prerequisites only)
- Updated SDK README to include hex/UTF-8 one-liner
