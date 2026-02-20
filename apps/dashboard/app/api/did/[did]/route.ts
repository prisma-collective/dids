import { NextResponse } from 'next/server';
import type { DIDEvent } from '@prisma-dids/types';

interface DIDEventRecord {
  txHash: string;
  event: DIDEvent;
  blockHeight: number;
  timestamp: string;
}

/**
 * Proxy to the P1 Indexer API.
 * Normalizes indexer responses to match the existing contract that didService.ts expects:
 * - GET /api/did/:did?network=preprod       → { latest: DIDEventRecord | null, services: [] }
 * - GET /api/did/:did?network=preprod&history=true → { events: DIDEventRecord[] }
 */

function getIndexerUrl(network: string): string | null {
  const key = `INDEXER_URL_${network.toUpperCase()}`;
  return process.env[key] ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ did: string }> }
) {
  const { did } = await params;
  const url = new URL(request.url);
  const network = url.searchParams.get('network') || 'preprod';
  const history = url.searchParams.get('history') === 'true';

  const indexerUrl = getIndexerUrl(network);
  if (!indexerUrl) {
    return NextResponse.json(
      { error: `Indexer not configured for ${network}. Set INDEXER_URL_${network.toUpperCase()} env var.` },
      { status: 500 }
    );
  }

  try {
    if (history) {
      // Fetch full history from indexer — revalidate every 30s
      const res = await fetch(
        `${indexerUrl}/did/${encodeURIComponent(did)}/history?order=asc&limit=100&includeUnconfirmed=true`,
        { next: { revalidate: 30 } }
      );

      if (res.status === 404) {
        return NextResponse.json({ events: [] });
      }
      if (!res.ok) {
        throw new Error(`Indexer error: ${res.status}`);
      }

      const data = await res.json();

      // Normalize indexer response → { events: DIDEventRecord[] }
      const events: DIDEventRecord[] = (data.events ?? []).map((e: any) => ({
        txHash: e.txHash,
        event: {
          id: did,
          ipfs: e.ipfsCid ?? '',
          action: e.action,
          v: e.version,
          prev: e.prevTxHash ?? null,
          payloadSig: '', // Not stored in indexer DB (only raw_event has it)
          ts: e.timestamp,
        } satisfies DIDEvent,
        blockHeight: e.blockHeight,
        timestamp: e.timestamp,
      }));

      return NextResponse.json({ events });
    } else {
      // Use the indexer's /did/:did resolve endpoint — it fetches IPFS internally
      // with an in-memory LRU cache, much faster than a separate Pinata gateway call.
      // Also returns the full DID document with services.
      const [resolveRes, historyRes] = await Promise.all([
        fetch(
          `${indexerUrl}/did/${encodeURIComponent(did)}?includeUnconfirmed=true`,
          { next: { revalidate: 30 } }
        ),
        fetch(
          `${indexerUrl}/did/${encodeURIComponent(did)}/history?order=desc&limit=1&includeUnconfirmed=true`,
          { next: { revalidate: 30 } }
        ),
      ]);

      // If DID doesn't exist yet (both return 404)
      if (resolveRes.status === 404 && historyRes.status === 404) {
        return NextResponse.json({ latest: null, services: [] });
      }

      // DID is revoked (410) — still get the last event for display
      const isRevoked = resolveRes.status === 410;

      // Fail on unexpected upstream errors (not 200/404/410)
      if (!resolveRes.ok && !isRevoked && resolveRes.status !== 404) {
        throw new Error(`Indexer resolve error: ${resolveRes.status}`);
      }
      if (!historyRes.ok && historyRes.status !== 404) {
        throw new Error(`Indexer history error: ${historyRes.status}`);
      }

      // Build latest event from history response
      let latest: DIDEventRecord | null = null;
      if (historyRes.ok) {
        const histData = await historyRes.json();
        const e = histData.events?.[0];
        if (e) {
          latest = {
            txHash: e.txHash,
            event: {
              id: did,
              ipfs: e.ipfsCid ?? '',
              action: e.action,
              v: e.version,
              prev: e.prevTxHash ?? null,
              payloadSig: '',
              ts: e.timestamp,
            } satisfies DIDEvent,
            blockHeight: e.blockHeight,
            timestamp: e.timestamp,
          };
        }
      }

      // Extract services from the resolved DID document
      let services: { id: string; type: string; serviceEndpoint: string }[] = [];
      if (resolveRes.ok && !isRevoked) {
        const resolved = await resolveRes.json();
        const doc = resolved.document;
        if (doc && Array.isArray(doc.service)) {
          services = doc.service.filter(
            (s: any) => s && typeof s.serviceEndpoint === 'string'
          );
        }
      }

      return NextResponse.json({ latest, services });
    }
  } catch (error) {
    console.error('Error proxying to indexer:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch DID events' },
      { status: 500 }
    );
  }
}
