import type { DIDEvent } from '@prisma-dids/types';

export interface DIDEventRecord {
  txHash: string;
  event: DIDEvent;
  blockHeight: number;
  timestamp: string;
}

export interface LatestDIDResponse {
  latest: DIDEventRecord | null;
}

export interface DIDHistoryResponse {
  events: DIDEventRecord[];
}

export async function fetchLatestDIDEvent(
  did: string,
  network: 'preprod' | 'mainnet'
): Promise<DIDEventRecord | null> {
  const response = await fetch(`/api/did/${encodeURIComponent(did)}?network=${network}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch DID');
  }

  const data: LatestDIDResponse = await response.json();
  return data.latest;
}

export async function fetchDIDHistory(
  did: string,
  network: 'preprod' | 'mainnet'
): Promise<DIDEventRecord[]> {
  const response = await fetch(`/api/did/${encodeURIComponent(did)}?network=${network}&history=true`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch DID history');
  }

  const data: DIDHistoryResponse = await response.json();
  return data.events;
}
