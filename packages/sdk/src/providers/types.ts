import type { DIDEvent } from '@prisma-events/dids-types';

export interface DIDEventRecord {
  txHash: string;
  event: DIDEvent;
  blockHeight: number;
  timestamp: string;
}

export interface ChainProvider {
  /**
   * Fetches all DID events for a specific DID from metadata label 199674
   */
  fetchDIDEvents(did: string): Promise<DIDEventRecord[]>;

  /**
   * Gets the latest valid event for a DID
   */
  getLatestDIDEvent(did: string): Promise<DIDEventRecord | null>;
}
