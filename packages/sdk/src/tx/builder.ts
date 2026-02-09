import { Lucid, Blockfrost } from 'lucid-cardano';
import { L_DID } from '@prisma-dids/types';
import { serializeDIDMetadata } from './metadata';
import type { DIDEvent, NetworkConfig } from '@prisma-dids/types';

export async function submitDIDEvent(
  wallet: any,  // CIP-30 wallet
  event: DIDEvent,
  config: NetworkConfig
): Promise<string> {
  if (!config.blockfrostApiKey) {
    throw new Error('Blockfrost API key required for transaction submission');
  }

  // Initialize Lucid with Blockfrost provider
  const lucid = await Lucid.new(
    new Blockfrost(
      `https://cardano-${config.network.toLowerCase()}.blockfrost.io/api/v0`,
      config.blockfrostApiKey
    ),
    config.network
  );

  lucid.selectWallet(wallet);

  // Build tx with metadata (use constant)
  const metadata = serializeDIDMetadata(event);
  const tx = await lucid
    .newTx()
    .attachMetadata(L_DID, metadata[L_DID])
    .complete();

  const signedTx = await tx.sign().complete();
  const txHash = await signedTx.submit();

  return txHash;
}
