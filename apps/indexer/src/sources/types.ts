/**
 * MetadataSource — swappable data ingestion abstraction.
 * Only BlockfrostSource implemented now; add OuraWebhookSource or KoiosSource later
 * without changing processing/storage/API layers.
 */

export interface MetadataEvent {
  txHash: string;
  blockHeight: number;
  blockHash: string;
  blockTime: number; // Unix epoch seconds
  jsonMetadata: unknown;
}

export interface BlockInfo {
  height: number;
  hash: string;
  time: number;
}

export interface MetadataSource {
  /**
   * List metadata events for a given CIP-10 label.
   * @param label   - Metadata label (e.g. 199674 for L_DID)
   * @param order   - 'asc' for initial sync, 'desc' for incremental polling
   * @param page    - 1-indexed page number
   * @param count   - Items per page (max 100 for Blockfrost)
   */
  listLabelEvents(
    label: number,
    order: 'asc' | 'desc',
    page: number,
    count: number
  ): Promise<MetadataEvent[]>;

  /**
   * Get block info by height. Used for rollback detection.
   */
  getBlockByHeight(height: number): Promise<BlockInfo | null>;

  /**
   * Get the current chain tip height.
   */
  getChainTip(): Promise<number>;
}
