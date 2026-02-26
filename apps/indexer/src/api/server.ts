import Fastify from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import { eq } from 'drizzle-orm';
import type { IndexerConfig } from '../config/types.js';
import type { Database } from '../db/connection.js';
import { syncState } from '../db/schema.js';
import { registerDIDRoutes } from './routes/did.js';
import { registerUniversalResolverRoute } from './routes/universal.js';
import {
  registerVCResolveRoutes,
  registerVCIssuerRoutes,
  registerVCHolderRoutes,
  registerVCSchemasRoute,
} from './routes/vc.js';

// Handler registry: maps handlerId → route registration function
const handlerRegistry: Record<
  string,
  (app: ReturnType<typeof Fastify>, db: Database) => void
> = {
  'did:resolve': registerDIDRoutes,
  'did:history': () => {}, // Registered together with did:resolve
  'did:universal-resolver': registerUniversalResolverRoute,
  'vc:resolve': registerVCResolveRoutes,
  'vc:status': () => {}, // Registered together with vc:resolve
  'vc:issuer-list': registerVCIssuerRoutes,
  'vc:holder-list': registerVCHolderRoutes,
  'vc:schemas': registerVCSchemasRoute,
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

  // CORS + compression
  await app.register(cors, { origin: true });
  await app.register(compress);

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

  // Admin: reset sync state to force re-scan
  app.post('/admin/resync', async (request, reply) => {
    const { label } = (request.query as Record<string, string>);
    if (label) {
      await db.delete(syncState).where(eq(syncState.label, Number(label)));
    } else {
      await db.delete(syncState);
    }
    reply.send({ status: 'ok', message: 'Sync state reset. Poller will re-scan on next cycle.' });
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
