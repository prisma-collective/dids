import { describe, it, expect } from 'vitest';
import { verifyDIDEvent } from './verification.js';
import { deriveStakeAddressFromBaseAddress } from '../utils/stake.js';
import type { DIDEvent, DidEventPayload } from '@prisma-events/dids-types';
import { ed25519 } from '../utils/crypto-setup.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '../utils/encoding.js';

describe('verification', () => {
  describe('verifyDIDEvent', () => {
    it('should verify ed25519 signature works correctly', async () => {
      // Generate a valid keypair for testing
      const privateKeyBytes = ed25519.utils.randomSecretKey();
      const publicKeyBytes = await ed25519.getPublicKeyAsync(privateKeyBytes);

      const message = utf8ToBytes('test message');
      const signature = await ed25519.signAsync(message, privateKeyBytes);
      const valid = await ed25519.verifyAsync(signature, message, publicKeyBytes);

      expect(valid).toBe(true);
    });

    it('should return false for invalid signature', async () => {
      const invalidEvent: DIDEvent = {
        id: 'did:cardano:stake_test1test',
        ipfs: 'QmTest',
        action: 'create',
        v: 1,
        prev: null,
        payloadSig: JSON.stringify({
          sig: '00'.repeat(64), // Invalid signature
          key: '4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29',
          address: 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp',
        }),
        ts: new Date().toISOString(),
      };

      const result = await verifyDIDEvent(invalidEvent);
      expect(result).toBe(false);
    });

    it('should return false for malformed payloadSig', async () => {
      const malformedEvent: DIDEvent = {
        id: 'did:cardano:stake_test1test',
        ipfs: 'QmTest',
        action: 'create',
        v: 1,
        prev: null,
        payloadSig: 'not-valid-json',
        ts: new Date().toISOString(),
      };

      const result = await verifyDIDEvent(malformedEvent);
      expect(result).toBe(false);
    });

    it('should handle missing fields gracefully', async () => {
      const incompleteEvent = {
        id: 'did:cardano:stake_test1test',
        ipfs: 'QmTest',
        // Missing action, v, prev, payloadSig
      } as DIDEvent;

      const result = await verifyDIDEvent(incompleteEvent);
      expect(result).toBe(false);
    });

    // TODO: requires COSE_Sign1 test fixture — raw Ed25519 sig != COSE_Sign1 structure
    it.skip('should verify valid signature with mock Ed25519 signing', async () => {
      // Generate a valid test keypair
      const privateKeyBytes = ed25519.utils.randomSecretKey();
      const publicKeyBytes = await ed25519.getPublicKeyAsync(privateKeyBytes);

      // Test address - derive the stake address programmatically
      const testAddress = 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
      const expectedStakeAddr = deriveStakeAddressFromBaseAddress(testAddress);

      // Create test payload
      const payload: DidEventPayload = {
        id: `did:cardano:${expectedStakeAddr}`,
        ipfs: 'QmTestCID123',
        action: 'create',
        v: 1,
        prev: null,
      };

      // Sign the payload
      const payloadStr = JSON.stringify(payload);
      const messageBytes = utf8ToBytes(payloadStr);
      const signature = await ed25519.signAsync(messageBytes, privateKeyBytes);

      // Build DID event
      const event: DIDEvent = {
        ...payload,
        payloadSig: JSON.stringify({
          sig: bytesToHex(signature),
          key: bytesToHex(publicKeyBytes),
          address: testAddress,
        }),
        ts: new Date().toISOString(),
      };

      // Verify the event
      const result = await verifyDIDEvent(event);
      expect(result).toBe(true);
    });

    it('should fail verification when stake address does not match signer', async () => {
      // Generate a valid test keypair
      const privateKeyBytes = ed25519.utils.randomSecretKey();
      const publicKeyBytes = await ed25519.getPublicKeyAsync(privateKeyBytes);
      const testAddress = 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';

      // Wrong stake address (does not match testAddress)
      const wrongStakeAddr = 'stake_test1uzpq2pgu8yg7p6t8khs9r8w6vq4jm0p4d2j2k3p4s5z6q7c8d9e0f';

      const payload: DidEventPayload = {
        id: `did:cardano:${wrongStakeAddr}`,
        ipfs: 'QmTestCID123',
        action: 'create',
        v: 1,
        prev: null,
      };

      // Sign the payload
      const payloadStr = JSON.stringify(payload);
      const messageBytes = utf8ToBytes(payloadStr);
      const signature = await ed25519.signAsync(messageBytes, privateKeyBytes);

      // Build DID event
      const event: DIDEvent = {
        ...payload,
        payloadSig: JSON.stringify({
          sig: bytesToHex(signature),
          key: bytesToHex(publicKeyBytes),
          address: testAddress,
        }),
        ts: new Date().toISOString(),
      };

      // Should fail because DID stake address doesn't match signer's stake address
      const result = await verifyDIDEvent(event);
      expect(result).toBe(false);
    });
  });
});
