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
 * - GET /api/did/:did?network=preprod       → { latest: DIDEventRecord | null }
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
      // Fetch full history from indexer
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
      // Fetch latest event via history (limit=1, desc) for full DIDEventRecord shape
      const res = await fetch(
        `${indexerUrl}/did/${encodeURIComponent(did)}/history?order=desc&limit=1&includeUnconfirmed=true`,
        { next: { revalidate: 30 } }
      );

      if (res.status === 404) {
        return NextResponse.json({ latest: null });
      }
      if (!res.ok) {
        throw new Error(`Indexer error: ${res.status}`);
      }

      const data = await res.json();
      const events: DIDEventRecord[] = (data.events ?? []).map((e: any) => ({
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
      }));

      const latest = events[0] ?? null;
      return NextResponse.json({ latest });
    }
  } catch (error) {
    console.error('Error proxying to indexer:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch DID events' },
      { status: 500 }
    );
  }
}
