import { NextResponse } from 'next/server';
import { L_DID } from '@prisma-dids/types';
import type { DIDEvent } from '@prisma-dids/types';

interface DIDEventRecord {
  txHash: string;
  event: DIDEvent;
  blockHeight: number;
  timestamp: string;
}

/**
 * Reconstructs a string that may have been chunked for Cardano metadata.
 * If the value is an array, joins it back into a string.
 */
function unchunkString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join('');
  }
  return String(value ?? '');
}

/**
 * Recursively reconstructs an object from Cardano metadata format,
 * joining any chunked string arrays back into full strings.
 */
function reconstructFromMetadata(value: unknown): unknown {
  if (value === '') {
    return null; // Empty string was used for null in metadata
  }
  if (Array.isArray(value)) {
    // Check if it's a chunked string (array of strings) or actual array
    if (value.length > 0 && value.every(item => typeof item === 'string')) {
      // Could be chunked string - join it
      return value.join('');
    }
    return value.map(reconstructFromMetadata);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = reconstructFromMetadata(v);
    }
    return result;
  }
  return value;
}

async function fetchDIDEventsFromBlockfrost(
  did: string,
  apiKey: string,
  network: 'preprod' | 'mainnet'
): Promise<DIDEventRecord[]> {
  const baseUrl = `https://cardano-${network}.blockfrost.io/api/v0`;

  const response = await fetch(
    `${baseUrl}/metadata/txs/labels/${L_DID}?count=100&order=asc`,
    {
      headers: { project_id: apiKey },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error(`Blockfrost API error: ${response.status}`);
  }

  const data = await response.json();

  // Warn if we hit the 100-event limit
  if (data.length === 100) {
    console.warn(`DID ${did} may have more than 100 events; results truncated.`);
  }

  // Filter for this DID and reconstruct chunked metadata
  const events = data
    .filter((tx: any) => {
      const metadata = tx.json_metadata;
      // Handle chunked DID strings (arrays need to be joined)
      const metadataDid = unchunkString(metadata?.id);
      return metadataDid === did;
    })
    .map((tx: any) => ({
      txHash: tx.tx_hash,
      // Reconstruct the full event from chunked metadata
      event: reconstructFromMetadata(tx.json_metadata) as DIDEvent,
      blockHeight: tx.block_height,
      timestamp: tx.block_time,
    }));

  return events;
}

function getLatestEvent(events: DIDEventRecord[]): DIDEventRecord | null {
  if (events.length === 0) return null;

  return events.reduce((latest, current) =>
    current.event.v > latest.event.v ? current : latest
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ did: string }> }
) {
  const { did } = await params;
  const url = new URL(request.url);
  const network = (url.searchParams.get('network') || 'preprod') as 'preprod' | 'mainnet';

  // Get the appropriate Blockfrost key based on network
  const blockfrostKey = network === 'mainnet'
    ? process.env.BLOCKFROST_MAINNET_KEY
    : process.env.BLOCKFROST_PREPROD_KEY;

  if (!blockfrostKey) {
    return NextResponse.json(
      { error: `Blockfrost API key not configured for ${network}` },
      { status: 500 }
    );
  }

  try {
    // Check if we want full history or just latest
    const history = url.searchParams.get('history') === 'true';

    const events = await fetchDIDEventsFromBlockfrost(did, blockfrostKey, network);

    if (history) {
      return NextResponse.json({ events });
    } else {
      const latest = getLatestEvent(events);
      return NextResponse.json({ latest });
    }
  } catch (error) {
    console.error('Error fetching DID events:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch DID events' },
      { status: 500 }
    );
  }
}
