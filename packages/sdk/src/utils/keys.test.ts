import { describe, it, expect } from 'vitest';
import { hexToPublicKeyMultibase, isValidPublicKeyMultibase } from './keys.js';

describe('keys', () => {
  describe('hexToPublicKeyMultibase', () => {
    it('should convert valid 32-byte hex key to multibase format', () => {
      const hexKey = '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29';
      const result = hexToPublicKeyMultibase(hexKey);

      expect(result).toMatch(/^z6Mk/);
      expect(result).toHaveLength(48);
      expect(isValidPublicKeyMultibase(result)).toBe(true);
    });

    it('should throw error for invalid key length', () => {
      const invalidKey = 'abcd1234'; // Too short

      expect(() => hexToPublicKeyMultibase(invalidKey))
        .toThrow('Cannot extract public key from COSE_Key');
    });

    it('should produce consistent output for same input', () => {
      const hexKey = '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29';
      const result1 = hexToPublicKeyMultibase(hexKey);
      const result2 = hexToPublicKeyMultibase(hexKey);

      expect(result1).toBe(result2);
    });
  });

  describe('isValidPublicKeyMultibase', () => {
    it('should validate correct multibase keys', () => {
      const validKey = 'z6MkjchhfUsD6mmvni8mCdXHw216Xrm9bQe2mBH1P5RDjVJG';
      expect(isValidPublicKeyMultibase(validKey)).toBe(true);
    });

    it('should reject keys without z prefix', () => {
      const invalidKey = '6MkjchhfUsD6mmvni8mCdXHw216Xrm9bQe2mBH1P5RDjVJG';
      expect(isValidPublicKeyMultibase(invalidKey)).toBe(false);
    });

    it('should reject keys with invalid length', () => {
      const tooShort = 'z6Mk';
      expect(isValidPublicKeyMultibase(tooShort)).toBe(false);
    });
  });
});
