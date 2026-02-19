import type { MetadataSource, MetadataEvent, BlockInfo, RawLabelEvent, TxDetails } from './types.js';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const CIRCUIT_BREAKER_THRESHOLD = 5; // Consecutive 429s before tripping
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000; // 30s cooldown when tripped

/**
 * BlockfrostSource — implements MetadataSource using the Blockfrost API.
 * Includes retry/backoff with Retry-After support and circuit breaker for 429s.
 */
export class BlockfrostSource implements MetadataSource {
  private baseUrl: string;
  private headers: Record<string, string>;
  private consecutive429s = 0;
  private circuitOpenUntil = 0; // Timestamp when circuit breaker resets

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
        txIndex: typeof txInfo.index === 'number' ? txInfo.index : null,
        blockHeight: txInfo.block_height,
        blockHash: txInfo.block,
        blockTime: txInfo.block_time,
        jsonMetadata: item.json_metadata,
      });
    }

    return events;
  }

  async listRawLabelEvents(
    label: number,
    order: 'asc' | 'desc',
    page: number,
    count: number
  ): Promise<RawLabelEvent[]> {
    const url = `${this.baseUrl}/metadata/txs/labels/${label}?order=${order}&page=${page}&count=${count}`;
    const data = await this.fetchWithRetry(url);
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      txHash: item.tx_hash,
      jsonMetadata: item.json_metadata,
    }));
  }

  async getTxDetails(txHash: string): Promise<TxDetails> {
    const txInfo = await this.fetchWithRetry(`${this.baseUrl}/txs/${txHash}`);
    return {
      txHash,
      txIndex: typeof txInfo.index === 'number' ? txInfo.index : null,
      blockHeight: txInfo.block_height,
      blockHash: txInfo.block,
      blockTime: txInfo.block_time,
    };
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
    // Circuit breaker: if tripped, wait for cooldown before any request
    if (Date.now() < this.circuitOpenUntil) {
      const waitMs = this.circuitOpenUntil - Date.now();
      console.warn(`Circuit breaker open, waiting ${waitMs}ms before ${url}`);
      await sleep(waitMs);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(url, { headers: this.headers });

      if (res.ok) {
        this.consecutive429s = 0; // Reset on success
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
        if (res.status === 429) {
          this.consecutive429s++;
          if (this.consecutive429s >= CIRCUIT_BREAKER_THRESHOLD) {
            this.circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
            console.warn(`Circuit breaker tripped after ${this.consecutive429s} consecutive 429s, cooling down ${CIRCUIT_BREAKER_COOLDOWN_MS}ms`);
            throw new Error(`Blockfrost circuit breaker tripped: ${url}`);
          }
        }

        if (attempt < retries) {
          // Honor Retry-After header if present, otherwise exponential backoff
          const retryAfter = res.headers?.get?.('Retry-After') ?? null;
          const retryMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
          const backoff = Number.isFinite(retryMs) && retryMs > 0
            ? Math.min(retryMs, 30_000) // Cap at 30s
            : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
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
