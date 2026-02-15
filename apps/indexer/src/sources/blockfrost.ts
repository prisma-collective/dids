import type { MetadataSource, MetadataEvent, BlockInfo } from './types.js';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * BlockfrostSource — implements MetadataSource using the Blockfrost API.
 * Includes HTTP keep-alive and retry/backoff for 429/5xx responses.
 */
export class BlockfrostSource implements MetadataSource {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(apiKey: string, network: 'preprod' | 'mainnet') {
    this.baseUrl = `https://cardano-${network}.blockfrost.io/api/v0`;
    this.headers = { project_id: apiKey };
  }

  async listLabelEvents(
    label: number,
    order: 'asc' | 'desc',
    page: number,
    count: number
  ): Promise<MetadataEvent[]> {
    const url = `${this.baseUrl}/metadata/txs/labels/${label}?order=${order}&page=${page}&count=${count}`;
    const data = await this.fetchWithRetry(url);

    if (!Array.isArray(data)) return [];

    // Blockfrost metadata/txs/labels returns tx_hash + json_metadata but NOT block info.
    // We need to enrich each event with block info from /txs/{hash}.
    const events: MetadataEvent[] = [];
    for (const item of data) {
      const txInfo = await this.fetchWithRetry(
        `${this.baseUrl}/txs/${item.tx_hash}`
      );
      events.push({
        txHash: item.tx_hash,
        blockHeight: txInfo.block_height,
        blockHash: txInfo.block,
        blockTime: txInfo.block_time,
        jsonMetadata: item.json_metadata,
      });
    }

    return events;
  }

  async getBlockByHeight(height: number): Promise<BlockInfo | null> {
    try {
      const data = await this.fetchWithRetry(
        `${this.baseUrl}/blocks/${height}`
      );
      return {
        height: data.height,
        hash: data.hash,
        time: data.time,
      };
    } catch (err: any) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  async getChainTip(): Promise<number> {
    const data = await this.fetchWithRetry(`${this.baseUrl}/blocks/latest`);
    return data.height;
  }

  private async fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(url, { headers: this.headers });

      if (res.ok) {
        return res.json();
      }

      // 404 — not retryable
      if (res.status === 404) {
        const err = new Error(`Not found: ${url}`) as any;
        err.status = 404;
        throw err;
      }

      // 429 (rate limit) or 5xx — retryable
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(
            `Blockfrost ${res.status} on ${url}, retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`
          );
          await sleep(backoff);
          continue;
        }
      }

      throw new Error(`Blockfrost API error ${res.status}: ${url}`);
    }

    // Unreachable, but TypeScript
    throw new Error(`Blockfrost API failed after ${retries} retries: ${url}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
