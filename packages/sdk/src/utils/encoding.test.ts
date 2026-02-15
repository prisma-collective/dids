import { describe, it, expect } from 'vitest';
import { hexToBytes, bytesToHex, utf8ToBytes, bytesToUtf8, concatBytes } from './encoding.js';

describe('encoding', () => {
  describe('hexToBytes / bytesToHex round-trip', () => {
    it('should convert hex to bytes and back', () => {
      const original = '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29';
      const bytes = hexToBytes(original);
      const result = bytesToHex(bytes);

      expect(result).toBe(original);
      expect(bytes.length).toBe(32);
    });

    it('should handle empty string', () => {
      const original = '';
      const bytes = hexToBytes(original);
      const result = bytesToHex(bytes);

      expect(result).toBe(original);
      expect(bytes.length).toBe(0);
    });

    it('should throw on invalid hex length', () => {
      expect(() => hexToBytes('abc')).toThrow('Hex string must have even length');
    });
  });

  describe('utf8ToBytes / bytesToUtf8 round-trip', () => {
    it('should convert UTF-8 string to bytes and back', () => {
      const original = 'Hello, World!';
      const bytes = utf8ToBytes(original);
      const result = bytesToUtf8(bytes);

      expect(result).toBe(original);
    });

    it('should handle Unicode characters', () => {
      const original = 'Hello 世界 🌍';
      const bytes = utf8ToBytes(original);
      const result = bytesToUtf8(bytes);

      expect(result).toBe(original);
    });

    it('should handle JSON strings', () => {
      const original = '{"id":"did:cardano:stake_test1","action":"create"}';
      const bytes = utf8ToBytes(original);
      const result = bytesToUtf8(bytes);

      expect(result).toBe(original);
    });
  });

  describe('concatBytes', () => {
    it('should concatenate multiple byte arrays', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([4, 5]);
      const c = new Uint8Array([6, 7, 8, 9]);

      const result = concatBytes(a, b, c);

      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    });

    it('should handle empty arrays', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([]);
      const c = new Uint8Array([3, 4]);

      const result = concatBytes(a, b, c);

      expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
    });
  });
});
