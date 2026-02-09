# Prisma DIDs – Technical Design v1.3.1

## Cardano-Native DIDs & Verifiable Contributions

**Version:** 1.3.1
**Date:** November 16th 2025
**Authors:** Prisma Team
**Status:** Production-Ready MVP Specification (Aligned with Catalyst F14 Proposal)

---

## 0. Executive Summary

Prisma DIDs provides a **Cardano-native identity and verifiable contributions layer** using:

* A W3C-compliant **DID method** (`did:cardano`),
* **Verifiable Credentials (VCs)** to represent contributions,
* **CIP-20-style metadata + CIP-10 labels** as a DID & VC anchor registry,
* A **React dashboard** for DID management, VC viewing, and selective disclosure,
* A clear **roadmap to ZK / BBS+** and an optional **Plutus v2** for on-chain enforcement.

The MVP is designed to:

* Be fully deliverable within the Catalyst 6-month period,
* Match the Catalyst F14 proposal claims (DID creation, VC issuance, privacy dashboard, VC anchoring),
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
│  - Issue / verify VCs                      │
│  - Anchor VC issuance/validation           │
└─────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────┐
│       Prisma Dashboard (React / Next.js)   │
│  - CIP-30 wallet connection                │
│  - DID creation & management               │
│  - VC inbox & contribution history         │
│  - Selective disclosure / sharing controls │
└─────────────────────────────────────────────┘
```

> **Note on Resolver Implementation:** The Prisma Resolver Service is the reference implementation of this specification. Third-party integrators can either call Prisma's resolver API or re-implement the resolver logic independently using this spec. The specification defines the rules; the resolver is one implementation of those rules.

### 1.2 Technology Stack

* **Cardano**: base ledger & metadata registry
* **Metadata**: CIP-20-style JSON under **CIP-10 labels**
* **Wallets**: CIP-30 dApp connectors (Lace, Eternl, Nami, etc.)
* **Storage**: IPFS (e.g. Pinata)
* **Backend**: Node.js + TypeScript (Resolver & APIs)
* **SDK**: TypeScript client library
* **Frontend**: React / Next.js dashboard
* **Standards**: W3C DID Core, W3C VC Data Model
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
* `L_VC  = 199675` – Prisma VC issuance/validation anchors.

These are **CIP-20-style** uses: structured JSON attached under specific labels.

### 3.1.1 CIP-10 Label Registration Process

Prisma will submit a PR to the Cardano Foundation's CIP-10 registry:

* **Label 199674** – `PrismaDIDs`

  * Description: DID create/update/revoke events for Prisma's `did:cardano` method.
  * Schema: §3.2.

* **Label 199675** – `PrismaVCAnchors`

  * Description: VC issuance and validation events (anchors).
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

(Identical to v1.2 but now grounded in §2.1 & §3.3.)

### 4.2 Resolve DID

Resolver API:

* `GET /did/:did` → latest valid DID Document + metadata.
* `GET /did/:did/history` → full valid event chain.

### 4.3 Update DID

As in v1.2, using updated version and `prev` tx hash, with `payloadSig`.

### 4.4 Revoke DID

As in v1.2, with `action: "revoke"` and updated DID Document storing `status: "revoked"`.

*(To keep this from being too long, I'm not re-pasting all the TS snippets here—you can reuse the v1.2 code exactly, now backed by the formal specs.)*

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

### 5.2 VC Signing & Verification

We sign VCs with **Ed25519** and use a deterministic **JSON canonicalization** algorithm.

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

## 6. VC Anchoring & Validation Events (Label `L_VC`)

### 6.1 VC Anchor Schema

When a VC is **issued** or **validated**, we optionally emit an anchor under `L_VC`.

**Issuance:**

```json
{
  "event": "issued",
  "issuer": "did:cardano:stake1Issuer...",
  "holder": "did:cardano:stake1Holder...",
  "vcHash": "sha256-hex-of-canonical-vc",
  "vcType": "ContributionCredential",
  "ts": "2025-01-02T10:00:00Z"
}
```

**Validation:**

```json
{
  "event": "validated",
  "issuer": "did:cardano:stake1Issuer...",
  "holder": "did:cardano:stake1Holder...",
  "vcHash": "sha256-hex-of-canonical-vc",
  "validator": "did:cardano:stake1Verifier...",
  "vcType": "ContributionCredential",
  "ts": "2025-02-01T11:30:00Z"
}
```

**VC Hash Calculation:**

To ensure consistent `vcHash` values across implementations:

```ts
import { createHash } from 'crypto';
import jcs from 'json-canonicalize';

function computeVCHash(vc: VerifiableCredential): string {
  // 1. Canonicalize the complete VC (including proof.proofValue)
  // We hash the SIGNED VC, not the pre-signature form
  const canonical = jcs(vc);
  
  // 2. Compute SHA-256
  const hashBytes = createHash('sha256')
    .update(canonical, 'utf8')
    .digest();
  
  // 3. Return hex encoding
  return hashBytes.toString('hex');
}
```

**Notes:**

* The `vcHash` is computed over the **complete signed VC**, including `proof.proofValue`
* For BBS+-enabled VCs with a `"bbs"` extension field, the hash includes that field
* This ensures that standard and BBS+ versions of the same credential have different hashes
* The hash uniquely identifies a specific signed credential instance

This enables:

* On-chain metrics: `#VCs issued`, `#VC validations`,
* Cross-network reputation checks via VC hashes.

### 6.2 Usage

The SDK exposes:

```ts
anchorVC(vc, "issued"|"validated", { validatorDid? }): Promise<TxHash>
```

### 6.3 Privacy Implications of Anchoring

**What anchoring reveals:**

* VC hash (unique identifier),
* Issuer DID,
* Holder DID,
* Optional validator DID,
* VC type (e.g. `ContributionCredential`),
* Timestamps.

**What anchoring does *not* reveal:**

* Credential contents (hours, URLs, detailed data),
* Any unanchored fields of the VC,
* Underlying PII beyond what can be inferred from the DID itself.

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

(same as v1.2, now also indexing `L_VC` into `vc_events`)

* `did_events` table: DID chain, versions, valid flag.
* `vc_events` table: VC issuance/validation events keyed by `vcHash`.

---

## 8. Security Considerations

### 8.1 Integrity & Authenticity

* **DID events:** verified via Ed25519 signatures from payment keys whose stake credential matches the DID's stake address (see §3.3.2).
* **VCs:** verified via Ed25519 signatures from issuer DIDs.
* **VC anchors:** rely on VC signatures + canonical hashes.

### 8.2 Availability

* DID docs and optional VCs pinned in IPFS.
* Resolver can recompute state from chain + IPFS.

### 8.3 Threats & Mitigations

As in v1.2 (impersonation, forged VCs, etc.) handled by signatures and resolver rules.

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

## 9. Privacy & Selective Disclosure (MVP)

* MVP selective disclosure is UI/application-level:

  * User chooses which VCs / fields to share.
  * Only selected data is sent to relying parties.
* No ZK math is required for MVP to deliver meaningful privacy.

ZK / BBS+ is an **optional upgrade** (see §11.4).

---

## 10. API & SDK (Summary)

Already defined in v1.2; now backed by solid specs for:

* DID derivation,
* Event signing,
* VC canonicalization,
* VC anchoring.

---

## 11. Future Enhancements

### 11.1 ZK / BBS+ (Basic Demo)

See **11.4** below for detailed integration.

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

### 11.4 BBS+ Integration Plan (Post-MVP ZK Upgrade)

**Goals:**

* Enable **cryptographic selective disclosure** for a subset of ContributionCredentials.
* Do **not** break:

  * DID method,
  * VC schema,
  * VC anchoring.

#### 11.4.1 BBS+ Message Schema

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

#### 11.4.2 BBS+ Issuer Setup

* Generate BBS+ (BLS12-381) keypair per issuer.
* Add public key to issuer DID Document:

```json
{
  "id": "did:cardano:stake1Issuer...#bbs-key-1",
  "type": "Bls12381G1Key2020",
  "controller": "did:cardano:stake1Issuer...",
  "publicKeyMultibase": "zBbsPublicKey..."
}
```

#### 11.4.3 VC with BBS+ Extension

Base VC remains Ed25519-signed and canonical as in §5.2.
Optionally, we add:

```json
"bbs": {
  "schemaVersion": 1,
  "messagesOrder": ["id","projectId","contributionType","hours"],
  "signature": "<bbs-signature-base64>",
  "publicKeyRef": "did:cardano:stake1Issuer...#bbs-key-1"
}
```

* Existing verifiers ignore `bbs`.
* ZK-enabled verifiers use this to derive proofs.

#### 11.4.4 Selective Disclosure via BBS+ Presentation

Holder generates a **BBS+ presentation**:

```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiablePresentation", "BBSContributionPresentation"],
  "verifiableCredential": {
    "vcHash": "<sha256-of-canonical-vc>",
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
    "schemaFields": ["id","projectId","contributionType","hours"],
    "publicKeyRef": "did:cardano:stake1Issuer...#bbs-key-1"
  }
}
```

Verifier:

* Resolves issuer DID → gets BBS+ public key.
* Uses `schemaFields` and `revealed` indices to reconstruct messages.
* Calls `bbs.verifyProof(...)`.
* If valid, trusts `revealedFields` without knowing hidden fields.

#### 11.4.5 Dashboard UX

* Issuer:

  * Optional toggle: "Issue experimental ZK-capable credential (BBS+)".
* Holder:

  * BBS-enabled VCs show a "ZK" badge.
  * "Share" → two options:

    * Standard share (full VC),
    * Private share (BBS+ partial reveal).
* Verifier:

  * Simple UI to paste/load BBS+ presentation and verify.

#### 11.4.6 Backward Compatibility

* Existing VCs without `bbs` → work exactly as now; no ZK option.
* New VCs with `bbs` → compatible with both:

  * Standard VC verification,
  * Experimental ZK flows.
* No schema migrations or DID changes required.

#### 11.4.7 Recommended BBS+ Library

For TypeScript/JavaScript implementations:

**@mattrglobal/bbs-signatures** (or **@digitalbazaar/bbs-signatures**)

* npm: `@mattrglobal/bbs-signatures`
* Implements BBS+ with BLS12-381 curve
* Compatible with W3C CCG work on BBS+ signatures
* Actively maintained

**Example usage:**

```typescript
import {
  blsSign,
  blsVerify,
  blsCreateProof,
  blsVerifyProof,
  generateBls12381G2KeyPair
} from '@mattrglobal/bbs-signatures';

// Setup: Generate issuer BBS+ keypair
const issuerKeyPair = await generateBls12381G2KeyPair();
// Store public key in DID Document as per §11.4.2

// Sign VC with BBS+
const messages = [
  Buffer.from(vc.credentialSubject.id),
  Buffer.from(vc.credentialSubject.projectId),
  Buffer.from(vc.credentialSubject.contributionType),
  Buffer.from(String(vc.credentialSubject.hours))
];

const signature = await blsSign({
  keyPair: issuerKeyPair,
  messages
});

// Add to VC as "bbs" extension
vc.bbs = {
  schemaVersion: 1,
  messagesOrder: ["id", "projectId", "contributionType", "hours"],
  signature: Buffer.from(signature).toString('base64'),
  publicKeyRef: `${issuerDid}#bbs-key-1`
};

// Create selective disclosure proof (holder side)
const proof = await blsCreateProof({
  signature,
  publicKey: issuerKeyPair.publicKey,
  messages,
  nonce: randomBytes(32),
  revealed: [1, 2] // Reveal only projectId and contributionType
});

// Verify proof (verifier side)
const valid = await blsVerifyProof({
  proof,
  publicKey: issuerPublicKey,
  messages: partialMessages, // Only revealed messages
  nonce: providedNonce
});
```

**Installation:**

```bash
npm install @mattrglobal/bbs-signatures
```

---

## 12. Catalyst F14 Alignment (Quick Map)

* **Prototype:**

  * DID creation via wallet (CIP-30) + metadata (CIP-20 style) ✅
  * W3C VCs with cryptographic proofs (Ed25519 + JCS) ✅
  * React privacy dashboard with selective disclosure controls ✅
  * Testnet deployment + ALJ pilot usage ✅

* **Final version (post-MVP):**

  * NFC validation ✅ (roadmap in §11.2)
  * ZK proofs ✅ (BBS+ plan in §11.4)

* **Metrics:**

  * DIDs created, VCs issued, validation txs (via `L_VC`) ✅

---

**END – Prisma DIDs Technical Design v1.3.1**
