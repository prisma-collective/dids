import type { FastifyInstance } from 'fastify';
import { resolveDID } from '../../services/did-resolver.js';
import type { Database } from '../../db/connection.js';
import { isValidDid } from '../validate.js';

/**
 * W3C Universal Resolver endpoint.
 * GET /1.0/identifiers/:did
 *
 * Returns a DID Resolution Result per the W3C DID Resolution spec:
 * https://w3c-ccg.github.io/did-resolution/
 */
export function registerUniversalResolverRoute(
  app: FastifyInstance,
  db: Database
) {
  app.get<{
    Params: { did: string };
    Querystring: { includeUnconfirmed?: string };
  }>('/1.0/identifiers/:did', async (request, reply) => {
    const { did } = request.params;

    if (!isValidDid(did)) {
      return reply.code(400).send({
        didResolutionMetadata: { error: 'invalidDid' },
        didDocument: null,
        didDocumentMetadata: {},
      });
    }

    const includeUnconfirmed = request.query.includeUnconfirmed === 'true';

    const result = await resolveDID(db, did, includeUnconfirmed);

    if (result === 'not_found') {
      return reply.code(404).send({
        didResolutionMetadata: { error: 'notFound' },
        didDocument: null,
        didDocumentMetadata: {},
      });
    }

    if (result === 'revoked') {
      return reply.code(200).send({
        didResolutionMetadata: {},
        didDocument: null,
        didDocumentMetadata: { deactivated: true },
      });
    }

    reply.header('Cache-Control', 'public, max-age=60');
    return reply.send({
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocument: result.document,
      didDocumentMetadata: {
        created: result.metadata.created,
        updated: result.metadata.updated,
        versionId: String(result.metadata.version),
        deactivated: result.metadata.deactivated,
      },
    });
  });
}
