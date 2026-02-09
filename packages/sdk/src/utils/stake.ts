import { Address, BaseAddress, RewardAddress } from './cardano-serialization';

/**
 * Derives stake address (stake1...) from a base address (addr1...).
 * This is the core security binding for DID controller verification.
 * Per §3.3.2 of TECHNICAL_DESIGN v1.3.1.
 */
export function deriveStakeAddressFromBaseAddress(addressBech32: string): string {
  const addr = Address.from_bech32(addressBech32);
  const base = BaseAddress.from_address(addr);

  if (!base) {
    throw new Error('Expected base address (addr1...) for DID operations. Enterprise addresses not supported.');
  }

  const stakeCred = base.stake_cred();
  const networkId = base.to_address().network_id();
  const rewardAddr = RewardAddress.new(networkId, stakeCred);

  // Use correct prefix based on network
  // networkId: 0 = preprod/testnet, 1 = mainnet
  // NOTE: If adding other networks (e.g. sanchonet), extend this logic
  const prefix = networkId === 1 ? 'stake' : 'stake_test';
  return rewardAddr.to_address().to_bech32(prefix);
}

/**
 * Validates that an address is a base address (not enterprise).
 */
export function isBaseAddress(addressBech32: string): boolean {
  try {
    const addr = Address.from_bech32(addressBech32);
    return BaseAddress.from_address(addr) !== undefined;
  } catch {
    return false;
  }
}
