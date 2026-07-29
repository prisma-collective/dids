/**
 * Server-side IPFS pinning via Pinata (F-CFG-01).
 *
 * POST /api/ipfs/pin
 * Body: { data: object }
 * Returns: { cid: string }
 *
 * Uses PINATA_JWT (server-only). Never expose write credentials via NEXT_PUBLIC_*.
 */
import { PinataClient } from '@prisma-dids/sdk/browser';

const MAX_BODY_BYTES = 512 * 1024; // 512 KB

export async function POST(request: Request) {
  try {
    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
      return Response.json({ error: 'IPFS pinning is not configured' }, { status: 503 });
    }

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return Response.json({ error: 'Request body too large' }, { status: 413 });
    }

    const body = (await request.json()) as { data?: unknown };
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return Response.json({ error: 'Missing or invalid data object' }, { status: 400 });
    }

    const serialized = JSON.stringify(body.data);
    if (serialized.length > MAX_BODY_BYTES) {
      return Response.json({ error: 'Request body too large' }, { status: 413 });
    }

    const pinata = new PinataClient({ jwt: pinataJwt });
    const cid = await pinata.pinJSON(body.data as object);

    return Response.json({ cid });
  } catch (err) {
    console.error('IPFS pin failed:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Failed to pin content' }, { status: 500 });
  }
}
