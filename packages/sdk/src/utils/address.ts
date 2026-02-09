/**
 * Address utilities for CIP-30 wallet integration
 * Handles conversion between hex and bech32 address formats
 */

import { Address, RewardAddress } from './cardano-serialization';
import { hexToBytes } from './encoding';

/**
 * Decodes a CIP-30 hex-encoded address to bech32 format
 * Works for both base addresses (addr...) and stake addresses (stake...)
 */
export function hexAddressToBech32(hexAddress: string, network: 'mainnet' | 'preprod' = 'preprod'): string {
  const bytes = hexToBytes(hexAddress);

  if (bytes.length === 0) {
    throw new Error('Invalid address: empty bytes');
  }

  const addr = Address.from_bytes(bytes);

  // Determine prefix based on address type and network
  const networkId = addr.network_id();

  // Check if this is a reward/stake address (starts with 0xe or 0xf)
  const firstByte = bytes[0]!;
  const isRewardAddress = (firstByte & 0xf0) === 0xe0 || (firstByte & 0xf0) === 0xf0;

  if (isRewardAddress) {
    const prefix = networkId === 1 ? 'stake' : 'stake_test';
    return addr.to_bech32(prefix);
  }

  // Base address
  const prefix = networkId === 1 ? 'addr' : 'addr_test';
  return addr.to_bech32(prefix);
}

/**
 * Decodes a CIP-30 hex-encoded stake/reward address to bech32 format
 */
export function hexStakeAddressToBech32(hexAddress: string): string {
  const bytes = hexToBytes(hexAddress);
  const addr = RewardAddress.from_address(Address.from_bytes(bytes));

  if (!addr) {
    throw new Error('Invalid stake address format');
  }

  const networkId = addr.to_address().network_id();
  const prefix = networkId === 1 ? 'stake' : 'stake_test';

  return addr.to_address().to_bech32(prefix);
}
