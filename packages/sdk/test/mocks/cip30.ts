import * as ed25519 from '@noble/ed25519';

// Deterministic test keypair for verification tests
const TEST_PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
const TEST_PUBLIC_KEY = '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29'; // Derived from above

export const mockCIP30Wallet = {
  getNetworkId: () => Promise.resolve(0), // preprod
  getRewardAddresses: () => Promise.resolve(['stake_test1uqevw7fgvjna3ty89hxvp72gytmm8lf8qmx6rpshfmgc2cclq5c3a']),
  getChangeAddress: () => Promise.resolve('addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp'),
  getUsedAddresses: () => Promise.resolve(['addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp']),

  // Sign with deterministic key for verification tests
  signData: async (address: string, payloadHex: string) => {
    const message = Buffer.from(payloadHex, 'hex'); // Hex payload from signDIDPayload
    const privKeyBytes = Buffer.from(TEST_PRIVATE_KEY, 'hex');
    const signature = await ed25519.sign(message, privKeyBytes);

    return {
      signature: Buffer.from(signature).toString('hex'),
      key: TEST_PUBLIC_KEY
    };
  }
};

// Export for verification tests that need to check against known values
export const TEST_STAKE_ADDRESS = 'stake_test1uqevw7fgvjna3ty89hxvp72gytmm8lf8qmx6rpshfmgc2cclq5c3a';
export const TEST_BASE_ADDRESS = 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
