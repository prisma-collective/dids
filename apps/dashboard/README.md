# Prisma DIDs Dashboard

Web application for managing Decentralized Identifiers (DIDs) on Cardano. Create, update, and revoke DIDs using any CIP-30 compatible wallet.

## Features

- Connect CIP-30 wallets (Nami, Eternl, Lace)
- Create DIDs with W3C-compliant DID Documents
- Update DID Documents (IPFS-backed)
- Revoke DIDs permanently
- View DID history and chain status
- Network switching (Preprod/Mainnet)

## Prerequisites

- Node.js 18+
- pnpm 9+
- CIP-30 compatible browser wallet with tADA (for Preprod)
- Blockfrost API key (Preprod)
- Pinata JWT (for IPFS uploads)

## Environment Variables

Create `apps/dashboard/.env.local`:

```env
BLOCKFROST_PREPROD_KEY=preprodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_BLOCKFROST_PREPROD_KEY=preprodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_PINATA_JWT=your_pinata_jwt_token
INDEXER_URL_PREPROD=https://prisma-didsindexer-production.up.railway.app
NEXT_PUBLIC_DEFAULT_NETWORK=preprod
```

## Development

```bash
# From monorepo root
pnpm install
pnpm --filter dashboard dev
```

Opens at `http://localhost:3000`.

## Architecture

### Components

| Component | Description |
|-----------|-------------|
| `Dashboard` | Main layout — wallet connection + DID management |
| `WalletPicker` | CIP-30 wallet selection and connection |
| `DIDManager` | DID display, history, and action buttons |
| `CreateDID` | DID creation flow (generate doc → IPFS → sign → submit) |
| `UpdateDID` | DID update flow (new doc → IPFS → sign → submit) |
| `RevokeDID` | DID revocation with confirmation modal |
| `NetworkSelector` | Preprod/Mainnet toggle |
| `HelpModal` | Onboarding guide |

### Data Flow

```
Wallet (CIP-30) → SDK (sign + build) → IPFS (upload doc) → Cardano (submit tx)
                                                                    ↓
                                              Indexer (poll + validate) → API
                                                                    ↓
                                              Dashboard (query + display)
```

### Key Files

| Path | Purpose |
|------|---------|
| `app/page.tsx` | Root page |
| `app/layout.tsx` | Root layout with providers |
| `app/providers.tsx` | WalletContext + ThemeProvider setup |
| `contexts/WalletContext.tsx` | Wallet connection state management |
| `services/didService.ts` | SDK calls for DID operations |
| `app/api/did/[did]/route.ts` | Server-side DID resolver (proxies to indexer) |

### Workspace Packages

- `@prisma-events/dids-sdk` — DID lifecycle, signing, metadata serialization
- `@prisma-events/dids-types` — Shared TypeScript types and Zod schemas
- `@prisma-events/dids-ui` — Shared Tailwind component library

## Testing on Preprod

1. Connect a Preprod wallet with tADA
2. Create a DID — wallet prompts for `signData` (COSE_Sign1) then `signTx`
3. Wait for tx confirmation (~20-60s)
4. Verify DID appears in Dashboard with `valid: true`
5. See [TESTING_CHECKLIST.md](../../documentation/TESTING_CHECKLIST.md) for update/revoke procedures
