import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { IndexerConfig } from '../config/types.js';
import type { Database } from '../db/connection.js';
import { syncState } from '../db/schema.js';
import { registerDIDRoutes } from './routes/did.js';
import { registerUniversalResolverRoute } from './routes/universal.js';

// Handler registry: maps handlerId → route registration function
const handlerRegistry: Record<
  string,
  (app: ReturnType<typeof Fastify>, db: Database) => void
> = {
  'did:resolve': registerDIDRoutes,
  'did:history': () => {}, // Registered together with did:resolve
  'did:universal-resolver': registerUniversalResolverRoute,
};

export async function createServer(config: IndexerConfig, db: Database) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
    },
  });

  // CORS
  await app.register(cors, { origin: true });

  // Health endpoint
  app.get('/health', async () => {
    const rows = await db.select().from(syncState);
    return {
      status: 'ok',
      indexer: config.name,
      network: config.network,
      confirmationDepth: config.confirmationDepth ?? 112,
      sync: rows.map((r) => ({
        label: r.label,
        lastBlockHeight: r.lastBlockHeight,
        lastBlockHash: r.lastBlockHash,
      })),
    };
  });

  // Register config-driven routes
  const registered = new Set<string>();
  for (const endpoint of config.endpoints) {
    const handler = handlerRegistry[endpoint.handlerId];
    if (handler && !registered.has(endpoint.handlerId)) {
      handler(app, db);
      registered.add(endpoint.handlerId);
    }
  }

  return app;
}
