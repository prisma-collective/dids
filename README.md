# Prisma DIDs

W3C-compliant Decentralized Identifiers (DIDs) on Cardano blockchain using transaction metadata.

## Overview

Prisma DIDs implements a lightweight DID method (`did:cardano:`) that:
- Uses stake addresses as DID identifiers
- Stores DID Documents on IPFS (pinned via Pinata)
- Records DID events in Cardano transaction metadata (label `199674`)
- Supports full lifecycle: create, update, revoke
- Provides cryptographic verification via Ed25519 signatures

**Architecture:** Metadata-based approach (see [ADR-001](documentation/ADR-001_Prisma-DIDs_CIP68-vs-Metadata-v1.0.md))
**Specification:** [Technical Design v1.3.1](documentation/TECHNICAL_DESIGN_1.3.1.md)

## Monorepo Structure

```
prisma-DIDs/
├── apps/
│   ├── dashboard/      # Next.js 16 dashboard
│   ├── api/            # REST API for DID resolution
│   └── indexer/        # DID event indexer
├── packages/
│   ├── sdk/            # Core Prisma DIDs SDK
│   ├── types/          # Shared TypeScript types
│   ├── crypto/         # Verifiable credentials signing
│   └── ui/             # Shared React components
└── documentation/      # Technical specs & ADRs
```

## Quick Start

### Prerequisites

1. **Node.js 20+** and **pnpm 9+**
2. **Blockfrost API key** (https://blockfrost.io)
3. **Pinata API credentials** (https://pinata.cloud)
4. **Cardano wallet** with preprod ADA (Eternl/Lace/Nami)

### Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Build all packages
pnpm build

# Run tests
pnpm test

# Start dashboard (dev)
cd apps/dashboard
pnpm dev
```

## SDK Usage

```typescript
import {
  deriveDID,
  generateDIDDocument,
  buildCreatePayload,
  PinataClient,
  BlockfrostProvider
} from '@prisma-dids/sdk';

// 1. Derive DID from stake address
const did = deriveDID('stake_test1...');

// 2. Generate W3C DID Document
const didDoc = generateDIDDocument({
  did,
  publicKeyHex: '4cb5abf6...', // From wallet
  baseAddress: 'addr_test1...'
});

// 3. Pin to IPFS
const pinata = new PinataClient({ apiKey, apiSecret });
const cid = await pinata.pinJSON(didDoc);

// 4. Build & sign payload (with wallet)
const payload = buildCreatePayload({ did, ipfsCid: cid });
// Sign with CIP-30 wallet.signData()...

// 5. Submit to Cardano
// See documentation for full transaction flow
```

## Technology Stack

**Frontend:**
- Next.js 16 (Turbopack)
- React 19
- TypeScript 5.7

**SDK:**
- @noble/ed25519 v3 (WebCrypto)
- Lucid Cardano
- Blockfrost API

**Infrastructure:**
- Turborepo 2.6
- pnpm workspaces
- Vitest 4

## Key Features

### Browser-Safe Cryptography
- WebCrypto API for Ed25519 signatures
- No Node.js dependencies in browser bundles
- Automatic WASM library aliasing (Node ↔ Browser)

### Specification Compliance
- W3C DID Core 1.0
- Ed25519 signature scheme
- IPFS content addressing (CIDv1)
- Cardano metadata standards

### Developer Experience
- Full TypeScript support
- Comprehensive test coverage
- Monorepo architecture with Turborepo
- Hot module replacement (Turbopack)

## Modifying the Credential Schema

The credential schema is defined entirely in `packages/schemas/src/credentials/contribution.ts` using Zod. This is the only file you need to edit to change what fields a credential contains.

**What to edit:**

1. **Add or remove fields** in the `ContributionCredentialSchema.extend({})` block. Each field is a Zod type (e.g. `z.string()`, `z.number().positive().optional()`).
2. **Change the contribution type options** in the `ContributionTypeEnum` array at the top of the file.
3. **Update selective disclosure** in the `contributionDisclosableFields` array at the bottom. This controls which fields a holder can choose to reveal or hide when creating a presentation.

**What you do not need to change:**

- **On-chain transactions** only store a `vcHash` and an `ipfsCid`. The actual credential payload lives on IPFS, so the blockchain never sees or validates the schema fields. No smart contract changes needed.
- **The indexer** only indexes on-chain event metadata (`txHash`, `event`, `issuerDid`, `holderDid`, etc.). It never inspects the credential body stored on IPFS, so it keeps working as is regardless of schema changes.
- **The registry** (`packages/schemas/src/registry.ts`) already points to this schema and re-exports it automatically. The `/schemas` API endpoint will reflect your changes without any additional wiring.

**You also need to update the issuance form.** The form in `apps/vc-interface/components/IssuanceForm.tsx` has a hardcoded `credentialFields` object (around line 35) that does not read from the Zod schema. If you change the schema, you must mirror those changes in the form or it will break.

**Example: adding a `role` field to ContributionCredential**

1. In `packages/schemas/src/credentials/contribution.ts`, add the field to the Zod schema:
   ```ts
   role: z.string().min(1),                  // required text field
   // or
   role: z.string().optional(),              // optional text field
   ```
   If it should support selective disclosure, add `'role'` to the `contributionDisclosableFields` array.

2. In `apps/vc-interface/components/IssuanceForm.tsx`, add a matching entry to the `ContributionCredential` array inside `credentialFields`:
   ```ts
   { key: 'role', label: 'Role', type: 'text', required: true, canDisclose: false, defaultDisclosed: false },
   ```
   Each field needs:
   - `key`: must match the Zod field name exactly
   - `label`: what the user sees in the form
   - `type`: `'text'` for strings, `'number'` for numbers, `'select'` for enums
   - `required`: `true` if the Zod field is not `.optional()`
   - `options`: only for `'select'` type, list the enum values (e.g. `['code', 'design', 'other']`)
   - `canDisclose`: `true` if the field is in `contributionDisclosableFields`
   - `defaultDisclosed`: `true` if the disclosure checkbox should be pre-checked

The same pattern applies when removing or renaming fields. Delete or update the entry in both files.

## Documentation

- [API Reference](documentation/API.md) - Indexer REST API documentation
- [POC Plan](documentation/POC_PLAN.md) - Implementation roadmap
- [Technical Design](documentation/TECHNICAL_DESIGN_1.3.1.md) - Full specification
- [ADR-001](documentation/ADR-001_Prisma-DIDs_CIP68-vs-Metadata-v1.0.md) - Architecture decision

## Testing

```bash
# Run all tests
pnpm test

# Type checking
pnpm type-check

# Build verification
pnpm build

# SDK tests only
cd packages/sdk
pnpm test
```

## License

[Add your license here]

## Related Resources

- [W3C DID Core Specification](https://www.w3.org/TR/did-core/)
- [CIP-30: Cardano dApp-Wallet Web Bridge](https://cips.cardano.org/cips/cip30/)
- [Cardano Metadata Standards](https://github.com/cardano-foundation/CIPs)
