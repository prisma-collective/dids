import { describe, it, expect } from 'vitest';
import { convertForMetadata, serializeEventMetadata, serializeDIDMetadata } from './metadata.js';
import { L_DID } from '@prisma-dids/types';

// ─── convertForMetadata ───

describe('convertForMetadata', () => {
  it('should return short strings unchanged', () => {
    const short = 'hello world';
    expect(convertForMetadata(short)).toBe(short);
  });

  it('should return 64-char strings unchanged', () => {
    const exact = 'a'.repeat(64);
    expect(convertForMetadata(exact)).toBe(exact);
  });

  it('should chunk long strings into 64-char segments', () => {
    const long = 'a'.repeat(100);
    const result = convertForMetadata(long) as string[];

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('a'.repeat(64));
    expect(result[1]).toBe('a'.repeat(36));
  });

  it('should convert null to empty string', () => {
    expect(convertForMetadata(null)).toBe('');
  });

  it('should recursively process nested objects', () => {
    const input = {
      id: 'a'.repeat(100),
      nested: {
        value: null,
        name: 'short',
      },
    };
    const result = convertForMetadata(input) as Record<string, unknown>;

    expect(Array.isArray(result.id)).toBe(true);
    expect((result.nested as Record<string, unknown>).value).toBe('');
    expect((result.nested as Record<string, unknown>).name).toBe('short');
  });

  it('should process arrays of mixed types', () => {
    const input = ['short', 'a'.repeat(100), 42];
    const result = convertForMetadata(input) as unknown[];

    expect(result[0]).toBe('short');
    expect(Array.isArray(result[1])).toBe(true);
    expect(result[2]).toBe(42);
  });

  it('should preserve numbers and booleans', () => {
    expect(convertForMetadata(42)).toBe(42);
    expect(convertForMetadata(true)).toBe(true);
    expect(convertForMetadata(0)).toBe(0);
  });
});

// ─── serializeEventMetadata ───

describe('serializeEventMetadata', () => {
  it('should wrap event under correct label key', () => {
    const event = { action: 'create', v: 1 };
    const result = serializeEventMetadata(12345, event);

    expect(result).toHaveProperty('12345');
    const inner = result[12345] as Record<string, unknown>;
    expect(inner.action).toBe('create');
    expect(inner.v).toBe(1);
  });

  it('should throw when serialized output exceeds 16KB', () => {
    // Create an event with a massive string to exceed 16KB
    const hugeEvent = { data: 'x'.repeat(20000) };

    expect(() => serializeEventMetadata(199674, hugeEvent))
      .toThrow(/exceeds 16000 bytes/);
  });
});

// ─── serializeDIDMetadata ───

describe('serializeDIDMetadata', () => {
  it('should use L_DID (199674) as label key', () => {
    const event = {
      id: 'did:cardano:stake_test1uzcontroller',
      ipfs: 'QmTestCID',
      action: 'create' as const,
      v: 1,
      prev: null,
      payloadSig: '{"sig":"aa","key":"bb","address":"cc"}',
      ts: '2025-01-01T00:00:00.000Z',
    };

    const result = serializeDIDMetadata(event);

    expect(result).toHaveProperty(String(L_DID));
    expect(result[L_DID]).toBeDefined();
  });
});
