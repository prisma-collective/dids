# Prisma DIDs – Technical Design v1.5

## Cardano-Native DIDs & Verifiable Contributions

**Version:** 1.5
**Date:** December 9th 2025
**Authors:** Prisma Team
**Status:** Production-Ready MVP Specification with SD-JWT Selective Disclosure

---

## 0. Executive Summary

Prisma DIDs provides a **Cardano-native identity and verifiable contributions layer** using:

* A W3C-compliant **DID method** (`did:cardano`),
* **Verifiable Credentials (VCs)** to represent contributions,
* **SD-JWT selective disclosure** for privacy-preserving credential sharing,
* **CIP-20-style metadata + CIP-10 labels** as a DID & VC anchor registry,
* A **DID Dashboard** for identity management + a **VC Interface** (forkable) for credential operations,
* A clear **roadmap to ZK / BBS+** and an optional **Plutus v2** for on-chain enforcement.

### What's New in v1.5

* **DID/VC Interface Separation (§1.1, §1.3):** DID Dashboard as universal Cardano infrastructure; VC Interface as forkable/parametrized module
* **Forkable Architecture:** VC layer designed for organization-specific deployments (ALJ, Prisma, etc.)

### What's New in v1.4

* **SD-JWT Integration (§5.3):** Cryptographic selective disclosure for VCs using industry-standard SD-JWT format
* **VC Revocation (§6.4):** On-chain revocation events for credential lifecycle management
* **VC Format Indicator (§6.1):** Future-proof anchoring schema supporting multiple VC formats
* **Privacy Roadmap Update (§11.4):** Clear progression from SD-JWT → BBS+ → advanced ZK
* **Design Rationale (Appendix A):** Documentation of Hyperledger Identus and KERI evaluation

The MVP is designed to:

* Be fully deliverable within the Catalyst 6-month period,
* Match the Catalyst F14 proposal claims (DID creation, VC issuance, DID Dashboard + VC Interface, VC anchoring),
* Stay compatible with future NFC + ZK upgrades.

---

## 1. Architecture Overview

### 1.1 Components

```text
┌─────────────────────────────────────────────┐
│            Cardano Blockchain              │
│  ┌──────────────────────────────────────┐  │
│  │  Tx Metadata (CIP-20-style)         │  │
│  │  - DID events (L_DID)               │  │
│  │  - VC anchors/validation (L_VC)     │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────┐
│                 IPFS Storage               │
│  - DID Documents (JSON-LD)                 │
│  - Optional VC payloads (encrypted)        │
└─────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────┐
│           Prisma Resolver Service          │
│  - Indexes metadata for L_DID & L_VC       │
│  - Validates DID chains & signatures       │
│  - Exposes REST API for DID & VC events    │
└─────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────┐
│                Prisma SDK (TS)             │
│  - Create / update / revoke / resolve DID  │
│  - Issue / verify VCs (Ed25519 & SD-JWT)   │
│  - Anchor VC issuance/validation/revocation│
└─────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────────────────────────┐
│                    Frontend Layer (Decoupled)                       │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐  │
│  │   DID Dashboard (General)   │  │   VC Interface (Forkable)   │  │
│  │   ─────────────────────────│  │   ─────────────────────────│  │
│  │   - CIP-30 wallet connect   │  │   - Parametrized per org    │  │
│  │   - DID create/update/revoke│  │   - VC issuance forms       │  │
│  │   - DID Document viewer     │  │   - Credential inbox        │  │
│  │   - Universal Cardano usage │  │   - Selective disclosure    │  │
│  │                             │  │   - Organization branding   │  │
│  │   [Generic - All dApps]     │  │   [ALJ | Prisma | Custom]   │  │
│  └─────────────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

> **Note on Resolver Implementation:** The Prisma Resolver Service is the reference implementation of this specification. Third-party integrators can either call Prisma's resolver API or re-implement the resolver logic independently using this spec. The specification defines the rules; the resolver is one implementation of those rules.

### 1.3 Frontend Architecture: DID/VC Separation

The frontend layer is intentionally split into two distinct interfaces:

#### DID Dashboard (Universal)

A **general-purpose DID management interface** for any Cardano user:

* **Purpose:** Create, view, update, and revoke `did:cardano` identities
* **Target Users:** Any Cardano wallet holder
* **Scope:** DID-only operations, no VC-specific features
* **Deployment:** Single canonical instance (prisma-dids.io or similar)
* **Branding:** Neutral Cardano identity branding

The DID Dashboard is infrastructure—like a wallet or block explorer, it serves the entire ecosystem.

#### VC Interface (Forkable/Parametrized)

A **customizable credential interface** designed to be forked or parametrized per organization:

* **Purpose:** Issue, receive, present, and verify Verifiable Credentials
* **Target Users:** Organization members (e.g., ALJ contributors, Prisma team)
* **Scope:** Full VC lifecycle with organization-specific credential types
* **Deployment:** Multiple instances (one per organization or use case)
* **Branding:** Customizable per deployment (logo, colors, credential types)

> **Prisma Pilot: Action Learning Journey (ALJ)**
>
> ALJ is Prisma's first production deployment of the VC Interface. ALJ issues `ContributionCredential` VCs to track learning contributions. This pilot validates the parametrization model before broader adoption.

**Parametrization Options:**

| Parameter | Example Values |
|-----------|----------------|
| `ORG_NAME` | "Action Learning Journey", "Prisma", "Your Org" |
| `ORG_LOGO` | `/assets/alj-logo.svg`, `/assets/prisma-logo.svg` |
| `CREDENTIAL_TYPES` | `["ContributionCredential", "CourseCompletion"]` |
| `ISSUER_DIDS` | `["did:cardano:stake1u9...", "did:cardano:stake1ux..."]` |
| `THEME` | `{ primary: "#4F46E5", secondary: "#10B981" }` |
| `API_ENDPOINT` | `"https://api.alj.example.com"` |

**Fork vs Parametrize Decision:**

* **Parametrize** (recommended for MVP): Single codebase with environment variables; simpler maintenance
* **Fork** (future): Full codebase fork for deep customization; organizational independence

This separation ensures the DID layer remains stable infrastructure while the VC layer can evolve independently per use case.

### 1.2 Technology Stack

* **Cardano**: base ledger & metadata registry
* **Metadata**: CIP-20-style JSON under **CIP-10 labels**
* **Wallets**: CIP-30 dApp connectors (Lace, Eternl, Nami, etc.)
* **Storage**: IPFS (e.g. Pinata)
* **Backend**: Node.js + TypeScript (Resolver & APIs)
* **SDK**: TypeScript client library
* **Frontend**: React / Next.js dashboard
* **Standards**: W3C DID Core, W3C VC Data Model, IETF SD-JWT
* **Canonicalization**: JSON Canonicalization Scheme (RFC 8785 / `json-canonicalize`)

---

## 2. DID Method: `did:cardano`

### 2.1 Identifier Format

**Method name:** `cardano`

```text
did:cardano:<id>
```

Where `<id>` is derived from the **stake key** (reward address) of a CIP-30 wallet, so identities:

* Are **persistent** across payment addresses,
* Are **not** tied to a single spending address,
* Can be verified from chain-level stake key data.

Example:

```text
did:cardano:stake1u9rqg7a3skqzx8jxzvm9k2w3c5k6h7j8l9m0n1p2q3r4s5
```

**Network Assumptions:**

Unless otherwise specified, examples in this document assume **Cardano mainnet** (networkId = 1). On testnet/preprod, the DID derivation and stake address format are identical; only the bech32 prefix differs (e.g., `stake_test1...` on testnet vs `stake1...` on mainnet). The same DID method works across all Cardano networks.

### 2.1.1 DID Derivation Specification

We define a deterministic derivation from a CIP-30 wallet to `did:cardano`:

**Inputs:**

* CIP-30 wallet (e.g. Nami, Eternl),
* `rewardAddresses = await wallet.getRewardAddresses()`
  (array of Bech32 stake addresses, use `rewardAddresses[0]`).

**Algorithm:**

1. Obtain primary reward address:

   ```ts
   const rewardAddresses = await wallet.getRewardAddresses();
   const rewardAddress = rewardAddresses[0]; // e.g. "stake1u9..."
   ```

2. Define the DID identifier as **exactly** that Bech32 stake address:

   ```ts
   const didIdentifier = rewardAddress; // "stake1u9..."
   ```

3. Construct DID:

   ```ts
   const did = `did:cardano:${didIdentifier}`;
   ```

**Example:**

* Reward address:
  `stake1u9rqg7a3skqzx8jxzvm9k2w3c5k6h7j8l9m0n1p2q3r4s5`
* DID:
  `did:cardano:stake1u9rqg7a3skqzx8jxzvm9k2w3c5k6h7j8l9m0n1p2q3r4s5`

**Controller key:**

* The DID controller is the **stake key** that controls this reward address.
* In verification, we ensure signatures come from a key that corresponds to this stake key.

> Note: An implementation can use cardano-serialization-lib / Lucid to derive the stake key hash from the reward address if needed for lower-level checks, but **the DID identifier is the full Bech32 stake address.**

---

### 2.2 DID Document (IPFS)

DID Documents follow W3C DID Core and are stored in IPFS.

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "id": "did:cardano:stake1u9rqg7a3skqzx8jxzvm9k2w3c5k6h7j8l9m0n1p2q3r4s5",
  "verificationMethod": [
    {
      "id": "did:cardano:stake1u9...#key-1",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:cardano:stake1u9...",
      "publicKeyMultibase": "z6Mkf..."
    }
  ],
  "authentication": [
    "did:cardano:stake1u9...#key-1"
  ],
  "service": [
    {
      "id": "did:cardano:stake1u9...#prisma-api",
      "type": "PrismaContributionService",
      "serviceEndpoint": "https://api.prisma.events"
    }
  ]
}
```

Future BBS+ keys can be added as additional `verificationMethod` entries (see §11.4).

---

## 3. DID Registry via CIP-20-Style Metadata

### 3.1 Labels

Prisma uses two dedicated **CIP-10 metadata labels**:

* `L_DID = 199674` – Prisma DID events (create/update/revoke).
* `L_VC  = 199675` – Prisma VC issuance/validation/revocation anchors.

These are **CIP-20-style** uses: structured JSON attached under specific labels.

### 3.1.1 CIP-10 Label Registration Process

Prisma will submit a PR to the Cardano Foundation's CIP-10 registry:

* **Label 199674** – `PrismaDIDs`

  * Description: DID create/update/revoke events for Prisma's `did:cardano` method.
  * Schema: §3.2.

* **Label 199675** – `PrismaVCAnchors`

  * Description: VC issuance, validation, and revocation events (anchors).
  * Schema: §6.1.

---

### 3.2 DID Event JSON Schema (Label `L_DID`)

Each DID operation is a JSON object under label `L_DID`:

```json
{
  "id": "did:cardano:stake1u9...",
  "ipfs": "QmHashOfDIDDocument",
  "action": "create" | "update" | "revoke",
  "v": 1,
  "prev": null,
  "payloadSig": "{\"sig\":\"...\",\"key\":\"...\",\"address\":\"...\"}",
  "ts": "2025-01-01T12:00:00Z"
}
```

Fields:

* `id` – DID.
* `ipfs` – CID of DID Document for this version.
* `action` – `"create"`, `"update"`, or `"revoke"`.
* `v` – version number (1, 2, 3…).
* `prev` – previous tx hash for this DID (null for create).
* `payloadSig` – serialized CIP-30 signature (spec below).
* `ts` – timestamp (ISO 8601; logical convenience only).

**Optional Fields (Backward Compatibility):**

Resolvers SHOULD ignore unknown fields in DID events for forward compatibility. Early implementations MAY include additional fields (e.g., `ts` for client-side timestamp convenience). These fields are not validated and do not affect event processing.

### 3.2.1 Metadata Size Considerations

Cardano transaction metadata is limited to **~16KB per transaction**.

**DID events (L_DID):**

* Typical size: ~500-700 bytes
* Includes: DID string (~80 chars), IPFS CID (~46 chars), signature with address (~300 chars)
* Well within metadata limits with significant margin

**VC anchors (L_VC):**

* Typical size: ~300-400 bytes
* Only stores hash + DIDs + metadata, not full VC payload

**Large DID Documents:**

* Stored in IPFS (via `ipfs` field), not in metadata
* Only the IPFS CID is stored on-chain
* This approach keeps operations lightweight and cost-effective

---

### 3.3 Signature Specification (`payloadSig`)

#### 3.3.1 CIP-30 Signature Format

CIP-30 `signData` returns:

```ts
interface CIP30DataSignature {
  signature: string; // hex-encoded Ed25519 signature
  key: string;       // hex-encoded Ed25519 public key
}
```

**Prisma PayloadSig Format:**

To ensure the signing key can be properly bound to the stake address in the DID, we store three fields:

```ts
type PrismaPayloadSig = {
  sig: string;     // hex-encoded Ed25519 signature
  key: string;     // hex-encoded Ed25519 public key
  address: string; // bech32 address used in signData (base address)
};
```

**Signing Flow (dApp):**

1. Construct the **payload** object:

   ```ts
   type DidEventPayload = {
     id: string;
     ipfs: string;
     action: "create" | "update" | "revoke";
     v: number;
     prev: string | null;
   };
   ```

2. Choose a base address from the wallet (linked to the user's stake key):

   ```ts
   const address = await wallet.getChangeAddress(); // "addr1..."
   // OR: const addresses = await wallet.getUsedAddresses(); address = addresses[0];
   ```

3. Serialize payload and sign:

   ```ts
   const payloadStr = JSON.stringify(payload);
   const { signature, key } = await wallet.signData(address, payloadStr);
   ```

4. Create PrismaPayloadSig with the address:

   ```ts
   const payloadSig: PrismaPayloadSig = {
     sig: signature,
     key,
     address
   };
   ```

5. Store as JSON string in metadata:

   ```ts
   event.payloadSig = JSON.stringify(payloadSig);
   ```

Example metadata snippet:

```json
{
  "id": "did:cardano:stake1u9...",
  "ipfs": "QmHash...",
  "action": "create",
  "v": 1,
  "prev": null,
  "payloadSig": "{\"sig\":\"a1b2c3...\",\"key\":\"f4e5d6...\",\"address\":\"addr1...\"}",
  "ts": "2025-01-15T10:00:00Z"
}
```

#### 3.3.2 Verification Algorithm (Resolver)

The resolver verifies each event without access to the user's wallet, using only:

* DID identifier (`did:cardano:stake1...`)
* `payloadSig` (signature + public key + address)
* Cardano address rules

**High-level steps:**

1. Parse `payloadSig` to extract signature, key, and address
2. Verify Ed25519 signature over the payload
3. Derive the stake address from the base address
4. Ensure that stake address matches the DID identifier

**Implementation:**

```ts
async function verifyDIDEvent(event: DIDEvent): Promise<boolean> {
  // 1. Parse payloadSig
  const { sig, key, address } = JSON.parse(event.payloadSig) as PrismaPayloadSig;

  // 2. Reconstruct payload (must match what was signed)
  const payload: DidEventPayload = {
    id: event.id,
    ipfs: event.ipfs,
    action: event.action,
    v: event.v,
    prev: event.prev
  };
  const payloadStr = JSON.stringify(payload);
  const message = Buffer.from(payloadStr, "utf8");

  // 3. Verify Ed25519 signature
  const sigBytes = Buffer.from(sig, "hex");
  const keyBytes = Buffer.from(key, "hex");

  const validSig = ed25519.verify(sigBytes, message, keyBytes);
  if (!validSig) return false;

  // 4. Extract stake address from DID
  // DID format: "did:cardano:<stakeBech32>"
  const stakeAddressFromDid = event.id.replace("did:cardano:", ""); // "stake1..."

  // 5. Derive stake address from the signing address
  const stakeAddressFromSigningAddress = deriveStakeAddressFromBaseAddress(address);

  // 6. Compare controller
  const sameController = (stakeAddressFromDid === stakeAddressFromSigningAddress);

  return sameController;
}
```

**Helper function (using cardano-serialization-lib):**

```ts
/**
 * Derive stake bech32 address from a base address (addr1...).
 * Uses Cardano address structure: base address = payment credential + stake credential
 */
function deriveStakeAddressFromBaseAddress(addressBech32: string): string {
  // Using @emurgo/cardano-serialization-lib-nodejs or browser version

  const addr = Address.from_bech32(addressBech32);
  const base = BaseAddress.from_address(addr);

  if (!base) {
    throw new Error("Expected base address (addr1...) for DID operations");
  }

  const stakeCred = base.stake_cred();
  const networkId = base.to_address().network_id();
  const rewardAddr = RewardAddress.new(networkId, stakeCred);
  const stakeBech32 = rewardAddr.to_address().to_bech32("stake");

  return stakeBech32; // Returns "stake1..."
}
```

**Key points:**

* We do **not** assume `signData` uses the stake key directly
* We bind the DID to the stake address derived from the payment/base address used in `signData`
* If someone tries to sign with an address not tied to the correct stake key, the resolver will derive a different stake address and reject the event
* This approach works with all CIP-30 wallets that return base addresses

---

## 4. DID Operations (SDK)

The Prisma SDK exposes high-level operations; code below is illustrative.

### 4.1 Create DID

(Identical to v1.3.1 but now grounded in §2.1 & §3.3.)

### 4.2 Resolve DID

Resolver API:

* `GET /did/:did` → latest valid DID Document + metadata.
* `GET /did/:did/history` → full valid event chain.

### 4.3 Update DID

As in v1.3.1, using updated version and `prev` tx hash, with `payloadSig`.

### 4.4 Revoke DID

As in v1.3.1, with `action: "revoke"` and updated DID Document storing `status: "revoked"`.

---

## 5. Verifiable Credentials for Contributions

### 5.1 VC Schema (ContributionCredential)

A **ContributionCredential** represents verified contributions across pilots (ALJs, climate networks, research orgs, etc.).

**Complete Example:**

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1"
  ],
  "type": [
    "VerifiableCredential",
    "ContributionCredential"
  ],
  "issuer": "did:cardano:stake1Issuer...",
  "issuanceDate": "2025-01-02T10:00:00Z",
  "credentialSubject": {
    "id": "did:cardano:stake1Holder...",
    "projectId": "catalyst:fund14:prisma",
    "organization": "Prisma",
    "contributionType": "code",
    "hours": 42,
    "evidenceUrl": "https://github.com/org/repo/pull/123"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2025-01-02T10:00:00Z",
    "verificationMethod": "did:cardano:stake1Issuer...#key-1",
    "proofPurpose": "assertionMethod",
    "proofValue": "base64-encoded-signature..."
  }
}
```

**Key Fields:**

* `@context` – W3C VC context (required)
* `type` – VC types: base + ContributionCredential
* `issuer` – DID of the issuing organization/authority
* `issuanceDate` – ISO 8601 timestamp
* `credentialSubject` – The claims about the contribution:
  * `id` – Holder's DID
  * `projectId` – Project/proposal identifier
  * `organization` – Issuing organization name
  * `contributionType` – Type of work (code, research, documentation, etc.)
  * `hours` – Time contribution (optional)
  * `evidenceUrl` – Link to proof of work (optional)
* `proof` – Cryptographic proof (Ed25519 signature)

### 5.2 Basic VC Signing & Verification (Ed25519)

We sign VCs with **Ed25519** and use a deterministic **JSON canonicalization** algorithm.

> **Note:** This section describes the basic VC format. For selective disclosure capabilities, see §5.3 (SD-JWT).

#### 5.2.1 VC Canonicalization (JCS)

We use **JSON Canonicalization Scheme (JCS)** (RFC 8785), via `json-canonicalize`.

**Algorithm:**

1. Clone VC:

   ```ts
   const vcCopy = JSON.parse(JSON.stringify(vc));
   ```

2. Remove `proof.proofValue`:

   ```ts
   delete vcCopy.proof.proofValue;
   ```

3. Canonicalize with JCS:

   ```ts
   import jcs from "json-canonicalize";

   function canonicalizeVC(vc: VerifiableCredential): string {
     const vcCopy = JSON.parse(JSON.stringify(vc));
     delete vcCopy.proof.proofValue;
     return jcs(vcCopy);
   }
   ```

**Signing:**

```ts
const canonical = canonicalizeVC(vc);
const messageBytes = Buffer.from(canonical, "utf8");
const signatureBytes = ed25519.sign(issuerPrivateKey, messageBytes);
vc.proof.proofValue = Buffer.from(signatureBytes).toString("base64");
```

**Verification:**

```ts
const canonical = canonicalizeVC(receivedVC);
const messageBytes = Buffer.from(canonical, "utf8");
const signatureBytes = Buffer.from(receivedVC.proof.proofValue, "base64");

// Resolve issuer DID → get Ed25519 pub key
const issuerDidDoc = await resolveDID(receivedVC.issuer);
const pubKey = extractEd25519Key(issuerDidDoc); // from verificationMethod

const valid = ed25519.verify(signatureBytes, messageBytes, pubKey);
```

This ensures deterministic signatures/hashes across implementations.

---

### 5.3 SD-JWT Selective Disclosure

SD-JWT (Selective Disclosure JWT) enables **cryptographic selective disclosure** where holders can choose which claims to reveal when sharing credentials, without requiring zero-knowledge proofs.

#### 5.3.1 Overview

**Key Concepts:**

* **Issuer** creates a credential with designated disclosable fields
* **Holder** receives the full credential with all disclosure tokens
* **Holder** creates presentations revealing only selected fields
* **Verifier** can only see revealed fields, but knows hidden fields exist

**When to Use SD-JWT vs Basic Ed25519:**

| Scenario | Recommended Format |
|----------|-------------------|
| Public contributions (OSS, published work) | Basic Ed25519 (§5.2) |
| Private sharing with full disclosure | Basic Ed25519 (§5.2) |
| Selective field sharing (hide hours, etc.) | SD-JWT (§5.3) |
| Privacy-sensitive presentations | SD-JWT (§5.3) |

#### 5.3.2 SD-JWT VC Structure

An SD-JWT credential consists of:

1. **JWT part**: Contains always-visible claims + hashes of disclosable claims
2. **Disclosure tokens**: Base64url-encoded arrays containing disclosable claims

**Format:**

```
<JWT>~<Disclosure1>~<Disclosure2>~...
```

**Example:**

```
eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJkaWQ6Y2FyZGFubzpzdGFrZTEuLi4iLC...
~WyJzYWx0MSIsImhvdXJzIiw0Ml0
~WyJzYWx0MiIsIm9yZ2FuaXphdGlvbiIsIkFMSiJd
```

#### 5.3.3 Issuance Flow

**Step 1: Issuer defines the credential**

```typescript
import { SDJwtVcInstance } from '@sd-jwt/sd-jwt-vc';

const credential = {
  // Standard JWT claims
  iss: 'did:cardano:stake1...issuer',    // Issuer DID
  sub: 'did:cardano:stake1...holder',    // Holder DID
  jti: `urn:uuid:${crypto.randomUUID()}`, // REQUIRED: Unique ID for anchoring/revocation
  iat: Math.floor(Date.now() / 1000),
  vct: 'ContributionCredential',         // Verifiable Credential Type

  // Credential claims
  projectId: 'catalyst:fund14:prisma',   // Always visible
  contributionType: 'code',               // Always visible
  hours: 42,                              // Can be hidden
  organization: 'ALJ',                    // Can be hidden
  evidenceUrl: 'https://github.com/...',  // Can be hidden
};
```

**Step 2: Issuer specifies disclosable fields**

```typescript
// Fields marked true CAN be hidden by holder
// Fields not in frame are ALWAYS visible
const disclosureFrame = {
  hours: true,
  organization: true,
  evidenceUrl: true,
  // projectId and contributionType are NOT here = always visible
};
```

**Step 3: Issue the SD-JWT VC**

```typescript
const sdJwtVc = await issuerInstance.issue(credential, disclosureFrame);
// Returns: eyJ...~WyJ...~WyJ...~WyJ...
```

**Complete Issuance Example:**

```typescript
import { SDJwtVcInstance } from '@sd-jwt/sd-jwt-vc';
import { createSignerVerifier, digest } from '@sd-jwt/crypto-nodejs';
import { randomBytes } from 'crypto';

// Setup issuer instance (once per issuer)
async function createIssuerInstance(privateKeyBytes: Uint8Array, publicKeyBytes: Uint8Array) {
  const { signer, verifier } = await createSignerVerifier(
    privateKeyBytes,
    publicKeyBytes,
    'EdDSA'
  );

  return new SDJwtVcInstance({
    signer,
    verifier,
    signAlg: 'EdDSA',
    hasher: digest,
    hashAlg: 'sha-256',
    saltGenerator: () => randomBytes(16).toString('base64url'),
  });
}

// Issue credential
async function issueContributionCredential(
  issuerInstance: SDJwtVcInstance,
  issuerDid: string,
  holderDid: string,
  claims: {
    projectId: string;
    contributionType: string;
    hours?: number;
    organization?: string;
    evidenceUrl?: string;
  }
): Promise<{ sdJwtVc: string; jti: string }> {
  // Generate unique ID for anchoring and revocation
  const jti = `urn:uuid:${crypto.randomUUID()}`;

  const credential = {
    iss: issuerDid,
    sub: holderDid,
    jti,  // REQUIRED: Used as vcHash for anchoring/revocation
    iat: Math.floor(Date.now() / 1000),
    vct: 'ContributionCredential',
    ...claims,
  };

  const disclosureFrame: Record<string, boolean> = {};
  if (claims.hours !== undefined) disclosureFrame.hours = true;
  if (claims.organization !== undefined) disclosureFrame.organization = true;
  if (claims.evidenceUrl !== undefined) disclosureFrame.evidenceUrl = true;

  const sdJwtVc = await issuerInstance.issue(credential, disclosureFrame);

  // Return both the credential and the jti for anchoring
  return { sdJwtVc, jti };
}
```

#### 5.3.4 Presentation Flow (Holder)

The holder creates presentations by selecting which disclosable fields to reveal.

**Scenario 1: Full disclosure (to employer)**

```typescript
// Reveal all fields
const presentationForEmployer = await holderInstance.present(sdJwtVc, {
  hours: true,
  organization: true,
  evidenceUrl: true,
});
```

**Scenario 2: Partial disclosure (for CV/resume)**

```typescript
// Hide hours, reveal organization
const presentationForCV = await holderInstance.present(sdJwtVc, {
  hours: false,        // HIDE
  organization: true,  // REVEAL
  evidenceUrl: false,  // HIDE
});
```

**Complete Presentation Example:**

```typescript
async function createPresentation(
  holderInstance: SDJwtVcInstance,
  sdJwtVc: string,
  revealFields: {
    hours?: boolean;
    organization?: boolean;
    evidenceUrl?: boolean;
  }
): Promise<string> {
  return await holderInstance.present(sdJwtVc, revealFields);
}
```

#### 5.3.5 Verification Flow

**Step 1: Parse and verify the presentation**

```typescript
async function verifyPresentation(
  verifierInstance: SDJwtVcInstance,
  presentation: string,
  expectedIssuerDid: string
): Promise<{
  valid: boolean;
  claims: Record<string, unknown>;
  issuer: string;
  holder: string;
}> {
  try {
    const result = await verifierInstance.verify(presentation);

    // Check issuer matches expected
    if (result.payload.iss !== expectedIssuerDid) {
      return { valid: false, claims: {}, issuer: '', holder: '' };
    }

    return {
      valid: true,
      claims: result.payload,
      issuer: result.payload.iss as string,
      holder: result.payload.sub as string,
    };
  } catch (error) {
    return { valid: false, claims: {}, issuer: '', holder: '' };
  }
}
```

**Step 2: Resolve issuer DID for public key**

```typescript
async function verifyWithDIDResolution(
  presentation: string,
  expectedIssuerDid: string
): Promise<boolean> {
  // 1. Resolve issuer DID to get public key
  const issuerDidDoc = await resolveDID(expectedIssuerDid);
  const issuerPublicKey = extractEd25519Key(issuerDidDoc);

  // 2. Create verifier instance with issuer's public key
  const { verifier } = await createSignerVerifier(
    new Uint8Array(32), // Dummy private key (not used for verification)
    issuerPublicKey,
    'EdDSA'
  );

  const verifierInstance = new SDJwtVcInstance({
    verifier,
    signAlg: 'EdDSA',
    hasher: digest,
    hashAlg: 'sha-256',
  });

  // 3. Verify presentation
  const result = await verifierInstance.verify(presentation);
  return result !== null;
}
```

#### 5.3.6 What Verifiers See

**Full disclosure presentation:**

```json
{
  "iss": "did:cardano:stake1...issuer",
  "sub": "did:cardano:stake1...holder",
  "iat": 1699900000,
  "vct": "ContributionCredential",
  "projectId": "catalyst:fund14:prisma",
  "contributionType": "code",
  "hours": 42,
  "organization": "ALJ",
  "evidenceUrl": "https://github.com/..."
}
```

**Partial disclosure presentation (hours hidden):**

```json
{
  "iss": "did:cardano:stake1...issuer",
  "sub": "did:cardano:stake1...holder",
  "iat": 1699900000,
  "vct": "ContributionCredential",
  "projectId": "catalyst:fund14:prisma",
  "contributionType": "code",
  "organization": "ALJ",
  "_sd": ["hash1", "hash2"],
  "_sd_alg": "sha-256"
}
```

> **Note:** The `_sd` array indicates that hidden fields exist, but the verifier cannot determine which fields or their values.

#### 5.3.7 SDK Dependencies

**Required packages:**

```bash
npm install @sd-jwt/sd-jwt-vc @sd-jwt/crypto-nodejs jose
```

**Package versions (as of December 2025):**

* `@sd-jwt/sd-jwt-vc`: ^0.17.0 (pre-1.0, actively maintained by OpenWallet Foundation)
* `@sd-jwt/crypto-nodejs`: ^0.17.0
* `jose`: ^5.0.0 (for JWT decoding in hash computation)

> **Note:** The `@sd-jwt/*` packages are pre-1.0 and may have breaking changes. Pin to a specific minor version in production (e.g., `0.17.1`) and test upgrades carefully. Monitor the [OpenWallet Foundation sd-jwt-js repo](https://github.com/openwallet-foundation/sd-jwt-js) for updates.

---

## 6. VC Anchoring & Validation Events (Label `L_VC`)

### 6.1 VC Anchor Schema

When a VC is **issued**, **validated**, or **revoked**, we emit an anchor under `L_VC`.

**Issuance:**

```json
{
  "event": "issued",
  "issuer": "did:cardano:stake1Issuer...",
  "holder": "did:cardano:stake1Holder...",
  "vcHash": "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
  "vcType": "ContributionCredential",
  "vcFormat": "sd-jwt",
  "ts": "2025-01-02T10:00:00Z"
}
```

**Validation:**

```json
{
  "event": "validated",
  "issuer": "did:cardano:stake1Issuer...",
  "holder": "did:cardano:stake1Holder...",
  "vcHash": "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
  "validator": "did:cardano:stake1Verifier...",
  "vcType": "ContributionCredential",
  "vcFormat": "sd-jwt",
  "ts": "2025-02-01T11:30:00Z"
}
```

**Revocation (NEW in v1.4):**

```json
{
  "event": "revoked",
  "issuer": "did:cardano:stake1Issuer...",
  "vcHash": "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
  "vcType": "ContributionCredential",
  "reason": "employment_ended",
  "ts": "2025-03-15T09:00:00Z"
}
```

> **Note on vcHash:** For SD-JWT credentials, `vcHash` is the `jti` claim (e.g., `urn:uuid:...`). For Ed25519 credentials, it's the SHA-256 hash of the canonicalized VC. See §6.2 for computation details.

### 6.1.1 Fields Reference

| Field | Required | Description |
|-------|----------|-------------|
| `event` | Yes | Event type: `"issued"`, `"validated"`, or `"revoked"` |
| `issuer` | Yes | DID of the credential issuer |
| `holder` | For issued/validated | DID of the credential holder |
| `vcHash` | Yes | Credential identifier: `jti` claim for SD-JWT, SHA-256 hash for Ed25519 (see §6.2) |
| `vcType` | Yes | Credential type (e.g., `"ContributionCredential"`) |
| `vcFormat` | Yes | Format identifier: `"ed25519"`, `"sd-jwt"`, or `"bbs+"` |
| `validator` | For validated | DID of the validating party |
| `reason` | For revoked (optional) | Human-readable revocation reason |
| `ts` | Yes | ISO 8601 timestamp |

**Event Verb Compatibility:**

This version uses past-tense verbs (`issued`, `validated`, `revoked`). The canonical specification (TECHNICAL_DESIGN.md) uses imperative verbs (`issue`, `validate`, `revoke`). Resolvers MAY accept both forms and normalize them:

| Legacy Verb | Canonical Verb |
|-------------|----------------|
| `issued` | `issue` |
| `validated` | `validate` |
| `revoked` | `revoke` |

New implementations SHOULD use the canonical imperative verbs.

### 6.1.2 VC Format Values

| Value | Description | Reference |
|-------|-------------|-----------|
| `"ed25519"` | Basic Ed25519Signature2020 VC | §5.2 |
| `"sd-jwt"` | SD-JWT selective disclosure VC | §5.3 |
| `"bbs+"` | BBS+ zero-knowledge VC | §11.4 |

### 6.2 VC Hash Calculation

To ensure consistent `vcHash` values across implementations:

**For Ed25519 VCs (§5.2):**

> **Implementation Note:** The hash MUST be computed over the **complete signed credential**, including the `proof` object with `proofValue`. Do not hash a pre-signature form of the credential.

```ts
import { createHash } from 'crypto';
import jcs from 'json-canonicalize';

function computeVCHash(vc: VerifiableCredential): string {
  // Canonicalize the complete VC (including proof.proofValue)
  const canonical = jcs(vc);

  // Compute SHA-256
  const hashBytes = createHash('sha256')
    .update(canonical, 'utf8')
    .digest();

  return hashBytes.toString('hex');
}
```

**For SD-JWT VCs (§5.3):**

```ts
import { createHash } from 'crypto';
import { decodeJwt } from 'jose';

function computeSdJwtVcHash(sdJwtVc: string): string {
  // Extract the JWT part (before first ~) - stable across presentations
  const jwtPart = sdJwtVc.split('~')[0];

  // Use jti claim (REQUIRED for SD-JWT in Prisma DIDs)
  const payload = decodeJwt(jwtPart);
  if (payload.jti) {
    return payload.jti as string;
  }

  // Fallback: Hash the JWT part only (for legacy credentials without jti)
  // This is stable regardless of which disclosures are included
  const hashBytes = createHash('sha256')
    .update(jwtPart, 'utf8')
    .digest();

  return hashBytes.toString('hex');
}
```

> **IMPORTANT:** We hash the **JWT part only** (before the first `~`), not the full SD-JWT with disclosures. This ensures:
> * Holders can verify revocation status without revealing all claims
> * Verifiers can check revocation from any presentation (partial or full)
> * The `jti` claim is preferred if present (set by issuer at issuance)

**Notes:**

* The `vcHash` uniquely identifies a specific signed credential instance
* For SD-JWT, use `jti` claim or hash the **JWT part only** to preserve selective disclosure
* The JWT part is cryptographically bound to all disclosures via `_sd` hashes
* Different formats of the same logical credential have different hashes

### 6.3 Usage

The SDK exposes:

```ts
// Issue and optionally anchor
anchorVC(vc: VerifiableCredential | string, event: "issued" | "validated" | "revoked", options?: {
  validatorDid?: string;
  reason?: string;
  format?: "ed25519" | "sd-jwt" | "bbs+";
}): Promise<TxHash>

// Check if a VC has been revoked
isVCRevoked(vcHash: string): Promise<boolean>
```

### 6.4 VC Revocation

#### 6.4.1 Revocation Model

VCs in Prisma DIDs are **immutable once issued**. Revocation is handled through on-chain events:

* Issuer submits a revocation event under `L_VC`
* Verifiers check revocation status before accepting credentials
* Revoked credentials remain valid cryptographically but are marked as untrusted

#### 6.4.2 Revocation Flow

**Step 1: Issuer submits revocation**

```typescript
async function revokeVC(
  issuerDid: string,
  vcHash: string,
  vcType: string,
  reason?: string
): Promise<string> {
  const revocationEvent = {
    event: 'revoked',
    issuer: issuerDid,
    vcHash: vcHash,
    vcType: vcType,
    reason: reason || 'unspecified',
    ts: new Date().toISOString(),
  };

  // Submit to chain under L_VC label
  return await submitMetadata(L_VC, revocationEvent);
}
```

**Step 2: Verifier checks revocation status**

```typescript
async function verifyVCWithRevocationCheck(
  vc: VerifiableCredential | string,
  format: 'ed25519' | 'sd-jwt'
): Promise<{ valid: boolean; revoked: boolean }> {
  // 1. Verify signature
  const signatureValid = await verifyVCSignature(vc, format);
  if (!signatureValid) {
    return { valid: false, revoked: false };
  }

  // 2. Compute hash (for SD-JWT, uses jti or JWT-part hash - works with any presentation)
  const vcHash = format === 'sd-jwt'
    ? computeSdJwtVcHash(vc as string)  // Uses jti/JWT-part, not full SD-JWT
    : computeVCHash(vc as VerifiableCredential);

  // 3. Check revocation status
  const revoked = await isVCRevoked(vcHash);

  return { valid: !revoked, revoked };
}

async function isVCRevoked(vcHash: string): Promise<boolean> {
  // Query resolver for revocation events
  const events = await fetchVCEvents(vcHash);
  return events.some(e => e.event === 'revoked');
}
```

#### 6.4.3 Revocation Reasons

Common revocation reasons:

| Reason | Description |
|--------|-------------|
| `"employment_ended"` | Holder no longer associated with issuer |
| `"credential_superseded"` | Replaced by updated credential |
| `"issued_in_error"` | Credential was issued incorrectly |
| `"holder_request"` | Holder requested revocation |
| `"compliance"` | Regulatory or policy compliance |
| `"unspecified"` | No specific reason provided |

### 6.5 Privacy Implications of Anchoring

**What anchoring reveals:**

* VC hash (unique identifier),
* Issuer DID,
* Holder DID,
* Optional validator DID,
* VC type (e.g. `ContributionCredential`),
* VC format (`ed25519`, `sd-jwt`, `bbs+`),
* Timestamps.

**What anchoring does *not* reveal:**

* Credential contents (hours, URLs, detailed data),
* Any unanchored fields of the VC,
* Underlying PII beyond what can be inferred from the DID itself,
* Which fields are disclosable (for SD-JWT).

**When anchoring is recommended:**

* Public or semi-public contributions (OSS, published work),
* Grant applications where on-chain evidence is beneficial,
* Cases where cross-network recognition is desired.

**When anchoring should be avoided:**

* Sensitive personal achievements,
* Contributions tied to private or confidential projects,
* Situations where the holder prioritizes pseudonymity.

**Control:**

* Anchoring is **optional per credential**.
* The Prisma dashboard allows holders and/or issuers to choose anchoring strategies.

---

## 7. Prisma Resolver & Indexer

### 7.1 Database Schema

**`did_events` table:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `did` | VARCHAR | The DID identifier |
| `tx_hash` | VARCHAR | Cardano transaction hash |
| `action` | ENUM | create, update, revoke |
| `version` | INT | Version number |
| `prev_tx_hash` | VARCHAR | Previous transaction hash |
| `ipfs_cid` | VARCHAR | IPFS CID of DID Document |
| `valid` | BOOLEAN | Validation status |
| `block_height` | INT | Block number |
| `timestamp` | TIMESTAMP | Event timestamp |

**`vc_events` table:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tx_hash` | VARCHAR | Cardano transaction hash |
| `event` | ENUM | issued, validated, revoked |
| `issuer_did` | VARCHAR | Issuer DID |
| `holder_did` | VARCHAR | Holder DID (nullable for revoke) |
| `validator_did` | VARCHAR | Validator DID (for validated events) |
| `vc_hash` | VARCHAR | Credential ID: `jti` for SD-JWT, SHA-256 hash for Ed25519 |
| `vc_type` | VARCHAR | Credential type |
| `vc_format` | VARCHAR | Format: ed25519, sd-jwt, bbs+ |
| `reason` | VARCHAR | Revocation reason (nullable) |
| `block_height` | INT | Block number |
| `timestamp` | TIMESTAMP | Event timestamp |

### 7.2 API Endpoints

**DID Resolution:**

* `GET /did/:did` → Latest valid DID Document + metadata
* `GET /did/:did/history` → Full valid event chain

**VC Status:**

* `GET /vc/:vcHash` → VC anchor events (issued, validated, revoked)
* `GET /vc/:vcHash/status` → Current status (active/revoked)
* `GET /issuer/:did/credentials` → All VCs issued by DID
* `GET /holder/:did/credentials` → All VCs held by DID

---

## 8. Security Considerations

### 8.1 Integrity & Authenticity

* **DID events:** verified via Ed25519 signatures from payment keys whose stake credential matches the DID's stake address (see §3.3.2).
* **VCs (Ed25519):** verified via Ed25519 signatures from issuer DIDs.
* **VCs (SD-JWT):** verified via EdDSA signatures embedded in JWT.
* **VC anchors:** rely on VC signatures + canonical hashes.

### 8.2 Availability

* DID docs and optional VCs pinned in IPFS.
* Resolver can recompute state from chain + IPFS.

### 8.3 Threats & Mitigations

| Threat | Mitigation |
|--------|------------|
| Impersonation | Signature verification + stake address binding |
| Forged VCs | Issuer DID resolution + signature verification |
| Replay attacks | Version chaining (`prev` field) for DIDs |
| VC tampering | Hash verification against `vcHash` |
| Metadata spam | Resolver filters invalid signatures |

### 8.4 Security Model & On-Chain Spam

As discussed: chain can store arbitrary metadata; Prisma **resolver** is the gatekeeper:

* Invalid signatures → event ignored.
* Broken chains (wrong `prev`/`v`) → event ignored.
* Validity defined by cryptography + resolver, not by "any tx under our label".

#### 8.4.1 Security Assumptions for MVP

**DID Creation Model:**

While `did:cardano` identifiers use stake addresses for familiarity and persistence, **Cardano does not natively prove "stake key ownership" inside metadata alone**.

Prisma's MVP security model assumes:

* **DID creation happens via the Prisma dashboard** using CIP-30 wallets
* **Only users with access to the stake key** can produce valid signatures through CIP-30
* **The resolver filters out all improperly signed events**

This is an **application-level security model**, not Layer-1-enforced identity.

**Implications:**

* An attacker can submit "fake" DID creation events for any stake address
* The resolver will reject these events due to invalid signatures
* Spam transactions exist on-chain but do not affect the valid DID state
* Users interacting through the Prisma dashboard are fully protected

**Trustless Alternative (Future):**

A fully trustless "only the stake key owner can ever create this DID" guarantee would require an **optional Plutus v2 registry** (see §11.3) that enforces:

* Signature verification on-chain via Plutus script
* State management in UTxOs at a script address
* On-chain proof that DID operations come from the controller

For the **MVP**, the softer application-level assumption is acceptable because:

1. Users create DIDs through trusted UI (Prisma dashboard)
2. Resolver provides strong cryptographic validation
3. The threat model (spam, not impersonation) is manageable
4. On-chain enforcement can be added in v2 without breaking v1 DIDs

---

## 9. Privacy & Selective Disclosure

### 9.1 Privacy Levels

Prisma DIDs supports multiple privacy levels for credential sharing:

| Level | Format | Privacy Guarantee |
|-------|--------|-------------------|
| **Full Disclosure** | Ed25519 (§5.2) | All fields visible to verifier |
| **UI-Level Selection** | Ed25519 (§5.2) | Application filters fields before sending |
| **Cryptographic Selective Disclosure** | SD-JWT (§5.3) | Holder chooses fields; verifier knows hidden exist |
| **Zero-Knowledge** | BBS+ (§11.4) | Verifier learns nothing about hidden fields |

### 9.2 SD-JWT Privacy Properties

**What SD-JWT provides:**

* Holder control over which fields to reveal per-presentation
* Cryptographic binding (verifier cannot forge claims)
* Issuer signature covers all claims (including hidden ones)

**What SD-JWT does NOT provide:**

* True zero-knowledge (verifier sees `_sd` hashes indicating hidden fields)
* Predicate proofs (e.g., "hours > 10" without revealing exact value)
* Unlinkability across presentations

**Sufficient for contribution credentials:**

For the Prisma DIDs use case (contribution credentials), SD-JWT provides adequate privacy:

* Hiding hours from recruiters while showing project/type
* Hiding organization when sharing portfolio
* Revealing full details to employers when needed

### 9.3 Upgrade Path to ZK

SD-JWT serves as an intermediate step toward full ZK privacy:

```
MVP (v1.3.1)     v1.4            v2.0+
────────────────────────────────────────
UI-level    →   SD-JWT      →   BBS+
selection       (cryptographic   (true ZK,
                selective)       predicates)
```

See §11.4 for BBS+ integration plan.

---

## 10. API & SDK (Summary)

### 10.1 SDK Exports

```typescript
// DID Operations
export { deriveDID, generateDIDDocument } from './core/did';
export { buildCreatePayload, buildUpdatePayload, buildRevokePayload } from './core/payload';
export { signDIDPayload, verifyDIDEvent } from './core/signature';

// VC Operations (Ed25519)
export { signVC, verifyVC, canonicalizeVC } from './core/vc';

// VC Operations (SD-JWT) - NEW in v1.4
export {
  createSdJwtIssuer,
  issueSdJwtVC,
  presentSdJwtVC,
  verifySdJwtPresentation
} from './core/sd-jwt';

// Anchoring
export { anchorVC, isVCRevoked, fetchVCEvents } from './core/anchor';

// Providers
export { BlockfrostProvider, KoiosProvider } from './providers';

// Types
export type {
  DIDDocument,
  DIDEvent,
  VerifiableCredential,
  SdJwtVC,
  VCAnchorEvent
} from './types';
```

### 10.2 Quick Start Examples

**Create DID:**

```typescript
import { deriveDID, generateDIDDocument, buildCreatePayload } from '@prisma-events/dids-sdk';

const stakeAddress = await wallet.getRewardAddresses()[0];
const did = deriveDID(stakeAddress);
const didDoc = generateDIDDocument({ did, publicKeyHex: walletPubKey });
```

**Issue SD-JWT Credential:**

```typescript
import { createSdJwtIssuer, issueSdJwtVC } from '@prisma-events/dids-sdk';

const issuer = await createSdJwtIssuer(privateKey, publicKey);
const credential = await issueSdJwtVC(issuer, {
  issuerDid,
  holderDid,
  claims: { projectId, contributionType, hours, organization },
  disclosable: ['hours', 'organization'],
});
```

**Create Presentation (Hide Hours):**

```typescript
import { presentSdJwtVC } from '@prisma-events/dids-sdk';

const presentation = await presentSdJwtVC(credential, {
  hours: false,        // Hide
  organization: true,  // Reveal
});
```

---

## 11. Future Enhancements

### 11.1 Privacy Formats Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRIVACY EVOLUTION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   v1.3.1              v1.4                 v2.0                v3.0+        │
│   ──────────────────────────────────────────────────────────────────────    │
│                                                                             │
│   ┌─────────┐        ┌─────────┐         ┌─────────┐        ┌─────────┐   │
│   │ UI-only │   →    │ SD-JWT  │    →    │  BBS+   │   →    │ ZK-SNARK│   │
│   │ privacy │        │         │         │         │        │(if ever)│   │
│   └─────────┘        └─────────┘         └─────────┘        └─────────┘   │
│                                                                             │
│   Features:          Features:           Features:          Features:      │
│   • Share full VC    • Hide/reveal       • True ZK          • Arbitrary    │
│   • Trust app to     • Verifier sees     • Verifier sees    predicates     │
│     filter             hidden exist        nothing hidden   • Aggregation  │
│                      • Same Ed25519      • BLS12-381 keys   • Complex      │
│                        keys              • Predicates         proofs       │
│                                            possible                        │
│                                                                             │
│   Effort: Done       Effort: ~2 weeks    Effort: ~5 weeks   Effort: 3-6mo │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 NFC Validation

Post-MVP UX layer:

* NFC tags/cards linked to DIDs or VC references,
* Mobile app scans + signs,
* Writes VC anchors/validation events to chain under `L_VC`.

### 11.3 Optional Plutus v2 Registry

Potential v2:

* Plutus validator holds DID state in datums / UTxOs,
* Enforces on-chain that only controller (or multi-sig) can update a DID,
* Allows other contracts to consume DID state.

Not required for MVP; fully compatible with this design.

---

### 11.4 BBS+ Integration Plan (Post-SD-JWT ZK Upgrade)

> **Prerequisites:** SD-JWT (§5.3) should be implemented first. BBS+ builds on the same infrastructure with upgraded cryptography.

**Goals:**

* Enable **true zero-knowledge selective disclosure** for ContributionCredentials
* Support predicate proofs (e.g., "hours > 10" without revealing exact value)
* Do **not** break:
  * DID method,
  * VC schema,
  * VC anchoring,
  * Existing SD-JWT credentials.

#### 11.4.1 Migration from SD-JWT to BBS+

**Retrocompatibility model:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DUAL-FORMAT SUPPORT                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   SD-JWT VCs (v1.4)              BBS+ VCs (v2.0)                           │
│   ─────────────────              ──────────────────                         │
│   • Continue working             • New issuance option                      │
│   • Same verification            • True ZK proofs                           │
│   • No migration needed          • New key type in DID Doc                  │
│                                                                             │
│   Existing SD-JWT holders:       New BBS+ holders:                         │
│   • Keep using SD-JWT            • Request BBS+ credential                  │
│   • Request BBS+ if needed       • Get ZK features                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**What changes for BBS+:**

1. Issuer adds BLS12-381 key to DID Document
2. New VCs can be issued with BBS+ signatures
3. Verifier supports both SD-JWT and BBS+ verification

**What stays the same:**

* DID method (`did:cardano`)
* Anchoring schema (just different `vcFormat` value)
* Existing SD-JWT VCs remain valid

#### 11.4.2 BBS+ Message Schema

We use a **fixed ordered subset** of `credentialSubject` fields:

```ts
const bbsSchemaFields = [
  "id",               // 0 - holder DID
  "projectId",        // 1 - project / proposal ID
  "contributionType", // 2 - e.g. "code"
  "hours"             // 3 - numeric, stringified
] as const;
```

Messages:

```ts
const messages = [
  vc.credentialSubject.id,
  vc.credentialSubject.projectId,
  vc.credentialSubject.contributionType,
  String(vc.credentialSubject.hours)
];
```

All BBS+ sign/derive/verify operations use this order.

#### 11.4.3 BBS+ Issuer Setup

* Generate BBS+ (BLS12-381) keypair per issuer.
* Add public key to issuer DID Document:

```json
{
  "id": "did:cardano:stake1Issuer...#bbs-key-1",
  "type": "Bls12381G2Key2020",
  "controller": "did:cardano:stake1Issuer...",
  "publicKeyMultibase": "zBbsPublicKey..."
}
```

#### 11.4.4 VC with BBS+ Extension

Base VC remains SD-JWT compatible. Optionally, we add BBS+ signature:

```json
{
  "bbs": {
    "schemaVersion": 1,
    "messagesOrder": ["id", "projectId", "contributionType", "hours"],
    "signature": "<bbs-signature-base64>",
    "publicKeyRef": "did:cardano:stake1Issuer...#bbs-key-1"
  }
}
```

* Existing SD-JWT verifiers ignore `bbs`.
* ZK-enabled verifiers use this to derive proofs.

#### 11.4.5 Selective Disclosure via BBS+ Presentation

Holder generates a **BBS+ presentation**:

```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiablePresentation", "BBSContributionPresentation"],
  "verifiableCredential": {
    "vcHash": "<sha256-of-vc>",
    "issuer": "did:cardano:stake1Issuer...",
    "holder": "did:cardano:stake1Holder..."
  },
  "revealedFields": {
    "projectId": "catalyst:fund14:prisma",
    "contributionType": "code"
  },
  "bbsProof": {
    "signatureProofValue": "<bbs-derived-proof-base64>",
    "revealed": [1, 2],
    "schemaFields": ["id", "projectId", "contributionType", "hours"],
    "publicKeyRef": "did:cardano:stake1Issuer...#bbs-key-1"
  }
}
```

Verifier:

* Resolves issuer DID → gets BBS+ public key.
* Uses `schemaFields` and `revealed` indices to reconstruct messages.
* Calls `bbs.verifyProof(...)`.
* If valid, trusts `revealedFields` without knowing hidden fields.

#### 11.4.6 VC Interface UX

> **Note:** Per §1.3, VC features are in the forkable VC Interface, not the DID Dashboard.

* Issuer:
  * Format selector: "Standard (SD-JWT)" or "Zero-Knowledge (BBS+)"
* Holder:
  * BBS-enabled VCs show a "ZK" badge.
  * "Share" → format-appropriate disclosure UI
* Verifier:
  * Unified verification for both formats

#### 11.4.7 Recommended BBS+ Library

For TypeScript/JavaScript implementations:

**@mattrglobal/bbs-signatures**

* npm: `@mattrglobal/bbs-signatures`
* Implements BBS+ with BLS12-381 curve
* Compatible with W3C CCG work on BBS+ signatures

**Installation:**

```bash
npm install @mattrglobal/bbs-signatures
```

---

## 12. Catalyst F14 Alignment (Quick Map)

* **Prototype:**

  * DID creation via wallet (CIP-30) + metadata (CIP-20 style) ✅
  * W3C VCs with cryptographic proofs (Ed25519 + JCS) ✅
  * SD-JWT selective disclosure ✅ (NEW in v1.4)
  * DID Dashboard (universal) + VC Interface (forkable) with selective disclosure controls ✅
  * Testnet deployment + ALJ pilot usage ✅

* **Final version (post-MVP):**

  * NFC validation ✅ (roadmap in §11.2)
  * ZK proofs ✅ (BBS+ plan in §11.4)

* **Metrics:**

  * DIDs created, VCs issued, validation txs (via `L_VC`) ✅

---

## Appendix A: Design Rationale – Alternative Approaches Evaluated

During the design of Prisma DIDs v1.4, we evaluated two major identity frameworks to determine if integration would benefit the project:

1. **Hyperledger Identus** (formerly Atala PRISM)
2. **KERI** (Key Event Receipt Infrastructure)

### A.1 Hyperledger Identus Evaluation

#### A.1.1 Overview

Hyperledger Identus is a decentralized identity platform built on Cardano, providing the `did:prism` method with:

* Protocol Buffer-encoded operations
* PRISM Node infrastructure for DID resolution
* Multi-platform SDKs (TypeScript, Swift, Kotlin)
* Support for JWT-VC, SD-JWT-VC, and AnonCreds

#### A.1.2 Comparison with Prisma DIDs

| Aspect | Prisma DIDs (`did:cardano`) | Identus (`did:prism`) |
|--------|----------------------------|----------------------|
| **DID Format** | `did:cardano:stake1...` | `did:prism:...` |
| **Encoding** | JSON metadata | Protocol Buffers |
| **Resolution** | Standard Cardano APIs (Blockfrost/Koios) | Requires PRISM Node |
| **Cost per op** | ~0.17 ADA | ~0.2-0.5 ADA |
| **Infrastructure** | Minimal (existing Cardano infra) | Additional (PRISM nodes) |
| **Long-form DIDs** | Not supported | Supported |
| **SDK Complexity** | ~50 lines core logic | Full SDK dependency |

#### A.1.3 Decision: Not Adopted

**Reasons:**

1. **Infrastructure overhead**: Identus requires PRISM Node infrastructure for DID resolution. Prisma DIDs works with standard Cardano APIs (Blockfrost, Koios), reducing operational complexity.

2. **Sufficient functionality**: Our `did:cardano` method provides equivalent DID lifecycle operations (create/update/revoke) without additional dependencies.

3. **Simpler debugging**: JSON metadata is human-readable and inspectable on block explorers. Protocol Buffers require specialized tooling.

4. **Cardano-native approach**: Stake address binding provides elegant identity persistence without additional abstraction layers.

5. **Cost equivalence**: Both approaches have similar per-transaction costs, so Identus offers no cost advantage.

**What we adopted instead:**

* **SD-JWT**: We adopted the SD-JWT specification independently (not from Identus SDK) for selective disclosure, using the OpenWallet Foundation's `@sd-jwt/sd-jwt-vc` library.

### A.2 KERI Evaluation

#### A.2.1 Overview

KERI (Key Event Receipt Infrastructure) is a ledger-agnostic identity protocol featuring:

* Self-certifying identifiers (AIDs)
* Pre-rotation key management
* Key Event Logs (KELs) and Key Event Receipt Logs (KERLs)
* Witness-based trust model

#### A.2.2 Key Features Evaluated

**Pre-rotation:**

KERI's pre-rotation scheme commits to the next keypair before rotation, enabling:
* Recovery from key compromise
* Post-quantum safe rotation paths
* Offline backup key storage

**Ledger Independence:**

KERI can operate without a blockchain, using witnesses for consensus, or anchor to any ledger.

#### A.2.3 Decision: Not Adopted

**Reasons:**

1. **Different paradigm**: KERI is not DID-native (though `did:keri` exists). Adopting KERI would require fundamental architectural changes rather than incremental improvements.

2. **Infrastructure complexity**: KERI requires a witness network for indirect mode operation. This adds operational overhead inappropriate for our MVP scope.

3. **Overkill for use case**: Pre-rotation and key recovery are valuable for long-lived enterprise identities. For contribution credentials tied to Cardano wallets:
   * If a wallet is compromised, the user has larger problems than their DID
   * Stake key binding provides sufficient identity assurance
   * Key rotation is not in our MVP milestones

4. **Python-centric ecosystem**: Primary KERI implementation (KERIpy) is Python-based. Our stack is TypeScript-focused.

5. **Complexity vs. value**: The learning curve and implementation effort for KERI concepts doesn't justify the benefits for our specific use case.

**What we learned:**

KERI's pre-rotation concept is elegant and could be adapted in the future if key rotation becomes a requirement. However, for MVP, the simpler "stake key = identity" model is sufficient.

### A.3 Summary: Cardano-Native Approach

| Decision | Rationale |
|----------|-----------|
| Keep `did:cardano` | Simpler, works with standard Cardano APIs |
| Don't adopt Identus SDK | Infrastructure overhead, no significant benefit |
| Don't adopt KERI | Architectural mismatch, overkill for use case |
| Adopt SD-JWT independently | Industry standard, minimal dependencies |
| Keep BBS+ in roadmap | Clear upgrade path when ZK is needed |

**Our innovation is in the Cardano-native approach:**

* Stake address binding for identity persistence
* CIP-20 metadata for cost-effective operations
* Standard W3C compliance
* Incremental privacy upgrades (UI → SD-JWT → BBS+)

---

## Appendix B: Changelog

### v1.4 (December 2025)

**New Features:**

* §5.3: SD-JWT selective disclosure for VCs
* §6.1: Added `vcFormat` field to anchor schema
* §6.4: VC revocation events
* §9: Updated privacy model for SD-JWT
* §11.1: Privacy formats roadmap
* Appendix A: Identus/KERI evaluation rationale

**Changes:**

* §11.4: Reordered as post-SD-JWT upgrade path
* §7: Added `vc_format` column to database schema
* §10: Added SD-JWT SDK exports

**No Changes:**

* §2: DID Method (unchanged)
* §3: DID Registry (unchanged)
* §4: DID Operations (unchanged)
* §8.4.1: Security model (unchanged)

### v1.3.1 (November 2025)

* Initial production-ready specification
* DID method, registry, operations
* Basic VC format with Ed25519
* BBS+ roadmap

---

**END – Prisma DIDs Technical Design v1.4**
