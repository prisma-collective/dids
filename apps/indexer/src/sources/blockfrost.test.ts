import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BlockfrostSource } from './blockfrost.js';

describe('BlockfrostSource', () => {
  let source: BlockfrostSource;
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    source = new BlockfrostSource('test-api-key', 'preprod');
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getChainTip', () => {
    it('returns the latest block height', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ height: 12345, hash: 'abc', time: 1000 }),
      });

      const tip = await source.getChainTip();
      expect(tip).toBe(12345);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://cardano-preprod.blockfrost.io/api/v0/blocks/latest',
        { headers: { project_id: 'test-api-key' } }
      );
    });
  });

  describe('getBlockByHeight', () => {
    it('returns block info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ height: 100, hash: 'block_hash', time: 1000 }),
      });

      const block = await source.getBlockByHeight(100);
      expect(block).toEqual({ height: 100, hash: 'block_hash', time: 1000 });
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const block = await source.getBlockByHeight(999999);
      expect(block).toBeNull();
    });
  });

  describe('listLabelEvents', () => {
    it('fetches and enriches metadata events', async () => {
      // First call: list metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { tx_hash: 'tx_1', json_metadata: { id: 'did:cardano:test' } },
          ]),
      });
      // Second call: get tx info for enrichment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            block_height: 100,
            block: 'block_hash_1',
            block_time: 1700000000,
          }),
      });

      const events = await source.listLabelEvents(199674, 'desc', 1, 100);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        txHash: 'tx_1',
        blockHeight: 100,
        blockHash: 'block_hash_1',
        blockTime: 1700000000,
        jsonMetadata: { id: 'did:cardano:test' },
      });
    });

    it('returns empty array for non-array response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ error: 'no data' }),
      });

      const events = await source.listLabelEvents(199674, 'asc', 1, 100);
      expect(events).toEqual([]);
    });
  });

  describe('retry logic', () => {
    it('retries on 429 and succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ height: 100 }),
        });

      const tip = await source.getChainTip();
      expect(tip).toBe(100);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 and succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ height: 200 }),
        });

      const tip = await source.getChainTip();
      expect(tip).toBe(200);
    });
  });
});
