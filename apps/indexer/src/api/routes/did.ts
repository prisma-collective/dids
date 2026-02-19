import type { FastifyInstance } from 'fastify';
import { resolveDID, getDIDHistory } from '../../services/did-resolver.js';
import type { Database } from '../../db/connection.js';
import { isValidDid } from '../validate.js';

/**
 * DID resolution routes:
 * - GET /did/:did — resolve a DID to its current document + metadata
 * - GET /did/:did/history — get event history with pagination
 */
export function registerDIDRoutes(app: FastifyInstance, db: Database) {
  // GET /did/:did
  app.get<{
    Params: { did: string };
    Querystring: { includeUnconfirmed?: string };
  }>('/did/:did', async (request, reply) => {
    const { did } = request.params;

    if (!isValidDid(did)) {
      return reply.code(400).send({ error: 'Invalid DID format. Expected did:cardano:stake...' });
    }

    const includeUnconfirmed = request.query.includeUnconfirmed === 'true';

    const result = await resolveDID(db, did, includeUnconfirmed);

    if (result === 'not_found') {
      return reply.code(404).send({ error: 'DID not found', did });
    }

    if (result === 'revoked') {
      return reply.code(410).send({ error: 'DID has been revoked', did });
    }

    // Cache resolved DIDs for 60s
    reply.header('Cache-Control', 'public, max-age=60');
    reply.header('ETag', `"${did}-v${result.metadata.version}"`);
    return reply.send(result);
  });

  // GET /did/:did/history
  app.get<{
    Params: { did: string };
    Querystring: {
      limit?: string;
      offset?: string;
      order?: string;
      includeUnconfirmed?: string;
    };
  }>('/did/:did/history', async (request, reply) => {
    const { did } = request.params;

    if (!isValidDid(did)) {
      return reply.code(400).send({ error: 'Invalid DID format. Expected did:cardano:stake...' });
    }

    const limit = Math.max(1, Math.min(Number(request.query.limit) || 50, 100));
    const offset = Math.max(0, Number(request.query.offset) || 0);
    const order = request.query.order === 'asc' ? 'asc' : 'desc';
    const includeUnconfirmed = request.query.includeUnconfirmed === 'true';

    const result = await getDIDHistory(db, did, {
      limit,
      offset,
      order,
      includeUnconfirmed,
    });

    if (result === 'not_found') {
      return reply.code(404).send({ error: 'DID not found', did });
    }

    return reply.send(result);
  });
}
