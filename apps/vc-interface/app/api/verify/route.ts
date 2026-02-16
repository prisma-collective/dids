/**
 * Server-side verification endpoint.
 *
 * POST /api/verify
 * Body: { presentationString: string, checkRevocation?: boolean }
 *
 * Uses the Node.js SDK (verifyPresentation) which requires
 * cardano-serialization-lib-nodejs for COSE_Sign1 verification.
 *
 * Indexer endpoint is resolved from server-side config only (no SSRF).
 */
import { verifyPresentation } from '@prisma-dids/sdk/server';
import { config } from '@/config/resolve-config';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      presentationString?: string;
      checkRevocation?: boolean;
    };

    if (!body.presentationString) {
      return Response.json(
        { valid: false, claims: {}, issuer: '', holder: '', vct: '', jti: '', error: 'missing_presentation' },
        { status: 400 }
      );
    }

    const result = await verifyPresentation(body.presentationString, {
      checkRevocation: body.checkRevocation !== false && !!config.INDEXER_ENDPOINT,
      indexerEndpoint: config.INDEXER_ENDPOINT,
    });

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return Response.json(
      { valid: false, claims: {}, issuer: '', holder: '', vct: '', jti: '', error: message },
      { status: 500 }
    );
  }
}
