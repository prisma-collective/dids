import { describe, it, expect } from 'vitest';
import { unchunkString, reconstructFromMetadata } from './metadata.js';

describe('unchunkString', () => {
  it('joins an array of strings', () => {
    expect(unchunkString(['hello', ' world'])).toBe('hello world');
  });

  it('returns a plain string as-is', () => {
    expect(unchunkString('hello')).toBe('hello');
  });

  it('handles null/undefined', () => {
    // null ?? '' = '' → String('') = ''
    expect(unchunkString(null)).toBe('');
    expect(unchunkString(undefined)).toBe('');
  });

  it('joins chunked 64-byte strings', () => {
    const chunk1 = 'a'.repeat(64);
    const chunk2 = 'b'.repeat(20);
    expect(unchunkString([chunk1, chunk2])).toBe(chunk1 + chunk2);
  });
});

describe('reconstructFromMetadata', () => {
  it('restores empty string to null', () => {
    expect(reconstructFromMetadata('')).toBe(null);
  });

  it('leaves non-empty strings alone', () => {
    expect(reconstructFromMetadata('hello')).toBe('hello');
  });

  it('joins chunked string arrays', () => {
    expect(reconstructFromMetadata(['abc', 'def'])).toBe('abcdef');
  });

  it('recursively reconstructs nested objects', () => {
    const input = {
      id: ['did:cardano:stake_test1', 'xyz123'],
      action: 'create',
      prev: '',
      nested: {
        value: ['chunk1', 'chunk2'],
        empty: '',
      },
    };

    const result = reconstructFromMetadata(input) as any;
    expect(result.id).toBe('did:cardano:stake_test1xyz123');
    expect(result.action).toBe('create');
    expect(result.prev).toBe(null);
    expect(result.nested.value).toBe('chunk1chunk2');
    expect(result.nested.empty).toBe(null);
  });

  it('preserves numbers and booleans', () => {
    expect(reconstructFromMetadata(42)).toBe(42);
    expect(reconstructFromMetadata(true)).toBe(true);
  });

  it('handles deeply nested structures', () => {
    const input = {
      a: { b: { c: { d: '' } } },
    };
    const result = reconstructFromMetadata(input) as any;
    expect(result.a.b.c.d).toBe(null);
  });
});
