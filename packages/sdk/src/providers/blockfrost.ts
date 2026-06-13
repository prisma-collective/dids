import axios from 'axios';
import { L_DID } from '@prisma-events/dids-types';
import type { ChainProvider, DIDEventRecord } from './types.js';

export class BlockfrostProvider implements ChainProvider {
  constructor(
    private apiKey: string,
    private network: 'preprod' | 'mainnet'
  ) {}

  async fetchDIDEvents(did: string): Promise<DIDEventRecord[]> {
    const baseUrl = `https://cardano-${this.network}.blockfrost.io/api/v0`;

    // Query metadata by label
    // NOTE: Blockfrost returns max 100 results per call
    // TODO: Add pagination if a single DID exceeds 100 events (unlikely in P0)
    //       Use the 'page' parameter: { count: 100, page: 2, order: 'asc' }
    //       This will fail silently for DIDs with 100+ updates; acceptable for MVP
    const response = await axios.get(
      `${baseUrl}/metadata/txs/labels/${L_DID}`,
      {
        headers: { project_id: this.apiKey },
        params: { count: 100, order: 'asc' }
      }
    );

    // Warn if we hit the 100-event limit (pagination not implemented)
    if (response.data.length === 100) {
      console.warn(`DID ${did} may have more than 100 events; results truncated. Pagination not implemented.`);
    }

    // Filter for this DID
    const events = response.data
      .filter((tx: any) => {
        const metadata = tx.json_metadata?.[L_DID];
        return metadata?.id === did;
      })
      .map((tx: any) => ({
        txHash: tx.tx_hash,
        event: tx.json_metadata[L_DID],
        blockHeight: tx.block_height,
        timestamp: tx.block_time
      }));

    return events;
  }

  async getLatestDIDEvent(did: string): Promise<DIDEventRecord | null> {
    const events = await this.fetchDIDEvents(did);
    if (events.length === 0) return null;

    // Return highest version (assumes events are sorted)
    return events.reduce((latest, current) =>
      current.event.v > latest.event.v ? current : latest
    );
  }
}
