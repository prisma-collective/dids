/**
 * MetadataSource — swappable data ingestion abstraction.
 * Only BlockfrostSource implemented now; add OuraWebhookSource or KoiosSource later
 * without changing processing/storage/API layers.
 */

export interface MetadataEvent {
  txHash: string;
  txIndex?: number | null; // Blockfrost tx_index within block; null if unavailable
  blockHeight: number;
  blockHash: string;
  blockTime: number; // Unix epoch seconds
  jsonMetadata: unknown;
}

/** Raw label event before tx enrichment (no block info). */
export interface RawLabelEvent {
  txHash: string;
  jsonMetadata: unknown;
}

/** Block-level details for a single transaction. */
export interface TxDetails {
  txHash: string;
  txIndex: number | null;
  blockHeight: number;
  blockHash: string;
  blockTime: number;
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
   * List raw label events WITHOUT tx enrichment.
   * Returns only tx_hash + json_metadata (1 API call, no N+1).
   */
  listRawLabelEvents(
    label: number,
    order: 'asc' | 'desc',
    page: number,
    count: number
  ): Promise<RawLabelEvent[]>;

  /**
   * Get block-level details for a single transaction.
   * Used to enrich raw events after dedup filtering.
   */
  getTxDetails(txHash: string): Promise<TxDetails>;

  /**
   * Get block info by height. Used for rollback detection.
   */
  getBlockByHeight(height: number): Promise<BlockInfo | null>;

  /**
   * Get the current chain tip height.
   */
  getChainTip(): Promise<number>;
}
