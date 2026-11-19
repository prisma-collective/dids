/**
 * Server-side IPFS pinning via Pinata (F-CFG-01).
 *
 * POST /api/ipfs/pin
 * Body: { data: object, ts: string, payloadSig: { sig, key, address } }
 * Returns: { cid: string }
 *
 * Pins only a DID document or a credential envelope, and only when the
 * DID's own wallet signed this pin (see verifyPinRequest). Without that
 * check, anyone could pin anything on Prisma's Pinata account.
 *
 * Uses PINATA_JWT (server-only). Never expose write credentials via NEXT_PUBLIC_*.
 */
import { PinataClient } from '@prisma-dids/sdk/browser';
import { verifyPinRequest } from '@prisma-dids/sdk/server';

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

    const check = await verifyPinRequest(await request.json());
    if (!check.ok) {
      return Response.json({ error: check.error }, { status: check.status });
    }

    const pinata = new PinataClient({ jwt: pinataJwt });
    const cid = await pinata.pinJSON(check.data);

    return Response.json({ cid });
  } catch (err) {
    console.error('IPFS pin failed:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Failed to pin content' }, { status: 500 });
  }
}
