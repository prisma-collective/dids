# @prisma-dids/sdk

Core SDK for Prisma DIDs — DID lifecycle management, Verifiable Credential issuance with selective disclosure, and Cardano on-chain anchoring.

## Installation

```bash
pnpm add @prisma-dids/sdk
```

## Entry Points

| Entry Point | Import | Use Case |
|-------------|--------|----------|
| Full (Node.js) | `@prisma-dids/sdk` | Server-side: includes COSE verification, VC anchoring |
| Browser | `@prisma-dids/sdk/browser` | Client-side: DID ops, signing, VC issuance (no CSL) |
| Server | `@prisma-dids/sdk/server` | Server-only: VC verification (`verifyPresentation`) |

## Quick Start — Create a DID

```typescript
import { deriveDID, generateDIDDocument, buildCreatePayload, signDIDPayload, buildDIDEvent, serializeDIDMetadata } from '@prisma-dids/sdk/browser';

// 1. Derive DID from wallet's stake address
const did = deriveDID('stake_test1uz...');

// 2. Generate W3C DID Document
const didDoc = generateDIDDocument({ did, publicKeyHex: '4cb5ab...' });

// 3. Upload DID Document to IPFS → get CID

// 4. Build, sign, and serialize
const payload = buildCreatePayload({ did, ipfsCid: 'QmAbC...' });
const sig = await signDIDPayload(wallet, payload, signingAddress);
const event = buildDIDEvent(payload, sig);
const metadata = serializeDIDMetadata(event);

// 5. Submit transaction with metadata under label 199674
```

## API Reference

### DID Generation

| Function | Description |
|----------|-------------|
| `deriveDID(stakeAddress)` | Derive `did:cardano:stake_test1...` from stake address |
| `generateDIDDocument({ did, publicKeyHex, ... })` | Generate W3C-compliant DID Document with Ed25519 multibase key |

### DID Lifecycle (Payload → Sign → Event → Metadata)

| Function | Description |
|----------|-------------|
| `buildCreatePayload({ did, ipfsCid })` | Build create payload (v=1, prev=null) |
| `buildUpdatePayload({ did, ipfsCid, prevTxHash, version })` | Build update payload |
| `buildRevokePayload({ did, ipfsCid, prevTxHash, version })` | Build revoke payload |
| `signDIDPayload(wallet, payload, address)` | Sign via CIP-30 `wallet.signData()` → COSE_Sign1 |
| `buildDIDEvent(payload, sig)` | Merge payload + sig + timestamp into `DIDEvent` |
| `serializeDIDMetadata(event)` | Serialize for Cardano metadata (label 199674, 64-byte chunking) |

### Verification

| Function | Description |
|----------|-------------|
| `verifyDIDEvent(event)` | Verify COSE_Sign1 signature + payload binding + controller match |
| `verifyCoseSign1Signature(payloadSig)` | Low-level COSE_Sign1 decode + Ed25519 verify (Node.js only) |

### Verifiable Credentials

| Function | Description |
|----------|-------------|
| `issueSDJwtVC(wallet, address, issuerDid, holderDid, vct, claims, options)` | Issue COSE-SD credential with selective disclosure |
| `createPresentation(credential, claimsToDisclose)` | Create selective-disclosure presentation from full credential |
| `getDisclosableClaims(credential)` | List all disclosable claims in a credential |

### VC On-Chain Anchoring

| Function | Description |
|----------|-------------|
| `anchorVCIssuance(wallet, address, params, config)` | Anchor issuance event on-chain (label 199675) |
| `anchorVCValidation(wallet, address, params, config)` | Anchor third-party validation |
| `anchorVCRevocation(wallet, address, params, config)` | Anchor revocation (issuer only) |
| `checkRevocationStatus(vcHash, indexerEndpoint)` | Query indexer for VC revocation status |

### Utilities

| Function | Description |
|----------|-------------|
| `hexToBytes` / `bytesToHex` | Hex ↔ Uint8Array conversion |
| `utf8ToBytes` / `bytesToUtf8` | UTF-8 ↔ Uint8Array conversion |
| `deriveStakeAddressFromBaseAddress(addr)` | Extract stake address from base address |
| `hexToPublicKeyMultibase(hex)` | Convert Ed25519 hex key to `z6Mk...` multibase format |
| `extractRawPublicKey(coseKeyHex)` | Extract 32-byte Ed25519 key from COSE_Key |

## DID Lifecycle

```
create (v=1, prev=null) → update (v=2, prev=tx₁) → ... → revoke (v=N, prev=txₙ₋₁)
```

- **create**: First event for a DID. Version must be 1, prev must be null.
- **update**: Increments version, points `prev` to the previous tx hash.
- **revoke**: Permanent. Same structure as update but action=revoke.

All events are signed with COSE_Sign1 via CIP-30 and anchored under Cardano metadata label **199674** (`L_DID`).

## Architecture Notes

- **COSE_Sign1**: All signatures use CIP-8/CIP-30 native COSE_Sign1 format (not JWS)
- **COSE-SD**: VCs use SD-JWT disclosure mechanism with COSE_Sign1 signing
- **Metadata label**: DID events use `L_DID = 199674`, VC events use `L_VC = 199675`
- **64-byte chunking**: Cardano metadata strings >64 bytes are chunked into arrays per CIP-20
- **Payload binding**: Signed bytes are verified to match `JSON.stringify({id, ipfs, action, v, prev})`

## Running Tests

```bash
pnpm --filter @prisma-dids/sdk test           # Run tests
pnpm --filter @prisma-dids/sdk test:coverage   # Run with coverage thresholds
```
