import type { ChainProvider, DIDEventRecord } from './types';

export class KoiosProvider implements ChainProvider {
  constructor(private network: 'preprod' | 'mainnet') {}

  async fetchDIDEvents(did: string): Promise<DIDEventRecord[]> {
    throw new Error('Koios provider not yet implemented');
  }

  async getLatestDIDEvent(did: string): Promise<DIDEventRecord | null> {
    throw new Error('Koios provider not yet implemented');
  }
}
