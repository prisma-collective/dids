/**
 * Client helper — pin JSON via server-side /api/ipfs/pin (F-CFG-01).
 * Pinata JWT stays on the server; never use NEXT_PUBLIC_PINATA_*.
 *
 * The wallet signs each pin (one signData prompt): the server pins only
 * documents that belong to the signing wallet's own DID.
 */
import { signPinIntent } from '@prisma-dids/sdk/browser';
import type { CIP30API } from '@prisma-dids/types';

export async function pinToIPFS(
  data: Record<string, unknown>,
  wallet: CIP30API,
  signingAddress: string
): Promise<string> {
  const signed = await signPinIntent(wallet, data, signingAddress);
  const res = await fetch('/api/ipfs/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signed),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `IPFS pin failed: ${res.status}`);
  }

  const result = (await res.json()) as { cid?: string };
  if (!result.cid) {
    throw new Error('IPFS pin failed: missing CID in response');
  }
  return result.cid;
}
