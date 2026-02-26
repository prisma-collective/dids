import Fastify from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import { eq } from 'drizzle-orm';
import type { IndexerConfig } from '../config/types.js';
import type { Database } from '../db/connection.js';
import { syncState, vcEvents } from '../db/schema.js';
import { verifyCoseSign1Signature, utf8ToBytes, bytesToHex } from '@prisma-dids/sdk';
import { VCEventPayloadSchema } from '@prisma-dids/schemas';
import { reconstructFromMetadata } from '../worker/metadata.js';
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

  // Admin: list invalid events for debugging
  app.get('/admin/invalid-events', async (_request, reply) => {
    const rows = await db
      .select({
        txHash: vcEvents.txHash,
        event: vcEvents.event,
        vcHash: vcEvents.vcHash,
        valid: vcEvents.valid,
        validationError: vcEvents.validationError,
        blockHeight: vcEvents.blockHeight,
        rawEvent: vcEvents.rawEvent,
      })
      .from(vcEvents)
      .where(eq(vcEvents.valid, false));
    reply.send({ count: rows.length, events: rows });
  });

  // Admin: debug payload mismatch for a specific tx
  app.get<{ Params: { txHash: string } }>('/admin/debug-payload/:txHash', async (request, reply) => {
    const { txHash } = request.params;

    try {
      const rows = await db.select().from(vcEvents).where(eq(vcEvents.txHash, txHash));
      if (rows.length === 0) return reply.code(404).send({ error: 'Not found' });

      const row = rows[0]!;
      const rawMetadata = JSON.parse(row.rawEvent);
      const reconstructed = reconstructFromMetadata(rawMetadata) as Record<string, unknown>;
      const parsed = VCEventPayloadSchema.safeParse(reconstructed);
      if (!parsed.success) return reply.send({ error: 'schema_invalid', details: parsed.error });

      const vcEvent = parsed.data;
      const payloadSig = JSON.parse(vcEvent.payloadSig);
      const coseResult = await verifyCoseSign1Signature(payloadSig);

      const expectedPayload = JSON.stringify({
        event: vcEvent.event, issuerDid: vcEvent.issuerDid, holderDid: vcEvent.holderDid,
        vcHash: vcEvent.vcHash, vcType: vcEvent.vcType, vcFormat: vcEvent.vcFormat,
        ...(vcEvent.reason !== undefined && { reason: vcEvent.reason }), ts: vcEvent.ts,
      });

      let signedStr: string | null = null;
      if (coseResult.signedPayload) {
        try { signedStr = new TextDecoder().decode(coseResult.signedPayload); } catch { /* not utf8 */ }
      }

      return reply.send({
        txHash, event: vcEvent.event, coseValid: coseResult.valid,
        signedPayloadStr: signedStr, expectedPayloadStr: expectedPayload,
        signedHex: coseResult.signedPayload ? bytesToHex(coseResult.signedPayload) : null,
        expectedHex: bytesToHex(utf8ToBytes(expectedPayload)),
        match: coseResult.signedPayload ? bytesToHex(coseResult.signedPayload) === bytesToHex(utf8ToBytes(expectedPayload)) : false,
      });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
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
