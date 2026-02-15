import { describe, it, expect } from 'vitest';
import { deriveStakeAddressFromBaseAddress } from './stake.js';

describe('stake', () => {
  describe('deriveStakeAddressFromBaseAddress', () => {
    it('should derive stake_test address from preprod base address', () => {
      // Example preprod address (addr_test1...)
      const baseAddress = 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
      const stakeAddress = deriveStakeAddressFromBaseAddress(baseAddress);

      expect(stakeAddress).toMatch(/^stake_test1/);
      expect(stakeAddress.length).toBeGreaterThan(50);
    });

    it('should throw error for invalid address', () => {
      // Invalid address format should throw
      const invalidAddress = 'invalid_address_format';

      expect(() => deriveStakeAddressFromBaseAddress(invalidAddress))
        .toThrow();
    });

    it('should produce consistent output for same input', () => {
      const baseAddress = 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
      const result1 = deriveStakeAddressFromBaseAddress(baseAddress);
      const result2 = deriveStakeAddressFromBaseAddress(baseAddress);

      expect(result1).toBe(result2);
    });
  });
});
