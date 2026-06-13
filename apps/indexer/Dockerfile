# Multi-stage build for Railway deployment
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10.6.1 --activate
WORKDIR /app

# Install dependencies (cached layer)
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/indexer/package.json ./apps/indexer/
COPY packages/types/package.json ./packages/types/
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/sdk/package.json ./packages/sdk/
RUN pnpm install --frozen-lockfile

# Build — extends deps so pnpm workspace symlinks stay intact
FROM deps AS builder
COPY packages/types/ ./packages/types/
COPY packages/schemas/ ./packages/schemas/
COPY packages/sdk/ ./packages/sdk/
COPY apps/indexer/ ./apps/indexer/
RUN pnpm --filter @prisma-events/dids-types build && \
    pnpm --filter @prisma-events/dids-schemas build && \
    pnpm --filter @prisma-events/dids-sdk build && \
    pnpm --filter @prisma-events/dids-indexer build

# Runtime
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/indexer/dist ./apps/indexer/dist
COPY --from=builder /app/apps/indexer/drizzle ./apps/indexer/drizzle
COPY --from=builder /app/apps/indexer/node_modules ./apps/indexer/node_modules
COPY --from=builder /app/apps/indexer/package.json ./apps/indexer/
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/schemas/dist ./packages/schemas/dist
COPY --from=builder /app/packages/schemas/package.json ./packages/schemas/
COPY --from=builder /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=builder /app/packages/sdk/package.json ./packages/sdk/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

WORKDIR /app/apps/indexer
EXPOSE 3001
CMD ["node", "dist/index.js"]
