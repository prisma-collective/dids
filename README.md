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

## Documentation

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
