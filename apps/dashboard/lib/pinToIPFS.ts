/**
 * Client helper — pin JSON via server-side /api/ipfs/pin (F-CFG-01).
 * Pinata JWT stays on the server; never use NEXT_PUBLIC_PINATA_*.
 */
export async function pinToIPFS(data: object): Promise<string> {
  const res = await fetch('/api/ipfs/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
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
