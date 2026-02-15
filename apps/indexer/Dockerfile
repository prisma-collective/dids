# Multi-stage build for Railway deployment
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10.6.1 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/indexer/package.json ./apps/indexer/
COPY packages/types/package.json ./packages/types/
COPY packages/sdk/package.json ./packages/sdk/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/indexer/node_modules ./apps/indexer/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/sdk/node_modules ./packages/sdk/node_modules
COPY . .
RUN pnpm --filter @prisma-dids/types build && \
    pnpm --filter @prisma-dids/sdk build && \
    pnpm --filter @prisma-dids/indexer build

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
COPY --from=builder /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=builder /app/packages/sdk/package.json ./packages/sdk/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

WORKDIR /app/apps/indexer
EXPOSE 3001
CMD ["node", "dist/index.js"]
