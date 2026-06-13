# Prisma DIDs

W3C-compliant Decentralized Identifiers (DIDs) on Cardano blockchain using transaction metadata.

> **New here?** See the [Developer Setup Guide](DEV_INSTALL.md) to get running locally in minutes.

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
} from '@prisma-events/dids-sdk';

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

## Deployment (Railway)

All services deploy to [Railway](https://railway.com) from the same GitHub repo. Each service has its own `railway.toml` config file.

### Deployed Services

| Service | Config File | Description |
|---------|------------|-------------|
| DIDs Indexer | `railway.toml` (root) | Indexes DID events from Cardano |
| ALJ VC Indexer | `railway.toml` (root) | Indexes Verifiable Credential events |
| Dids Dashboard | `apps/dashboard/railway.toml` | DID management interface |
| VCs Dashboard | `apps/vc-interface/railway.toml` | VC issuance & verification interface |
| DIDs - Postgres | — | Database for DIDs Indexer |
| ALJ VC - Postgres | — | Database for ALJ VC Indexer |

### Deploying a New Interface Service

1. In the Railway dashboard, click **New Service** → **GitHub Repo** → select this repo
2. Go to the service **Settings**:
   - **Config File Path**: set to `apps/dashboard/railway.toml` or `apps/vc-interface/railway.toml`
   - Leave **Root Directory** empty (the monorepo needs full workspace access)
3. Under **Networking**, generate a public domain and set the port to **8080**
4. Add the required **environment variables** (see below)
5. Push to `main` — Railway auto-deploys on every push

### Environment Variables

**Dids Dashboard:**

| Variable | Description |
|----------|-------------|
| `BLOCKFROST_PREPROD_KEY` | Server-side Blockfrost API key |
| `NEXT_PUBLIC_BLOCKFROST_PREPROD_KEY` | Client-side Blockfrost API key |
| `NEXT_PUBLIC_PINATA_JWT` | Pinata JWT for IPFS pinning |
| `NEXT_PUBLIC_DEFAULT_NETWORK` | Network (`preprod` or `mainnet`) |
| `INDEXER_URL_PREPROD` | DIDs Indexer URL (e.g. `https://prisma-didsindexer-production.up.railway.app`) |

**VCs Dashboard:**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_VC_INDEXER_ENDPOINT` | ALJ VC Indexer URL |
| `NEXT_PUBLIC_DID_INDEXER_ENDPOINT` | DIDs Indexer URL |
| `NEXT_PUBLIC_NETWORK` | Network (`preprod` or `mainnet`) |
| `NEXT_PUBLIC_BLOCKFROST_API_KEY` | Blockfrost API key |
| `NEXT_PUBLIC_PINATA_JWT` | Pinata JWT for IPFS pinning |
| `NEXT_PUBLIC_ISSUER_DIDS` | Comma-separated list of authorized issuer DIDs |
| `NEXT_PUBLIC_DASHBOARD_URL` | DIDs Dashboard URL for "View in DID Dashboard" links |

### Switching to Mainnet

No code changes are required — the app supports both networks via environment variables. To deploy on mainnet:

1. **Get a mainnet Blockfrost API key** from [blockfrost.io](https://blockfrost.io)
2. **Deploy new indexer instances** for mainnet (new Indexer + Postgres services) with:
   - `NETWORK=mainnet`
   - `BLOCKFROST_API_KEY=<mainnet key>`
3. **Update dashboard env vars**:
   - `NEXT_PUBLIC_DEFAULT_NETWORK=mainnet`
   - `BLOCKFROST_PREPROD_KEY` → replace with mainnet key (or add `BLOCKFROST_MAINNET_KEY`)
   - `NEXT_PUBLIC_BLOCKFROST_PREPROD_KEY` → replace with mainnet key
   - `INDEXER_URL_PREPROD` → add `INDEXER_URL_MAINNET` pointing to the mainnet indexer
4. **Update VCs Dashboard env vars**:
   - `NEXT_PUBLIC_NETWORK=mainnet`
   - `NEXT_PUBLIC_BLOCKFROST_API_KEY=<mainnet key>`
   - `NEXT_PUBLIC_ISSUER_DIDS` → use mainnet DIDs (`stake1...` instead of `stake_test1...`)
   - `NEXT_PUBLIC_VC_INDEXER_ENDPOINT` → point to mainnet VC indexer
   - `NEXT_PUBLIC_DID_INDEXER_ENDPOINT` → point to mainnet DID indexer

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

## Publishing

The SDK and its dependencies are published to npm under the `@prisma-events` org as **experimental** pre-releases. See [Publishing Guide](documentation/PUBLISHING.md) for maintainer instructions.

```bash
pnpm add @prisma-events/dids-sdk@experimental
```

## License

MIT — see [LICENSE](LICENSE).

## Related Resources

- [W3C DID Core Specification](https://www.w3.org/TR/did-core/)
- [CIP-30: Cardano dApp-Wallet Web Bridge](https://cips.cardano.org/cips/cip30/)
- [Cardano Metadata Standards](https://github.com/cardano-foundation/CIPs)
