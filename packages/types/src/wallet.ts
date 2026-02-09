// CIP-30 minimal types
export interface CIP30API {
  getNetworkId(): Promise<number>;
  getRewardAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  signData(address: string, payload: string): Promise<{ signature: string; key: string }>;
}

export interface CardanoProvider {
  name: string;
  icon: string;
  enable(): Promise<CIP30API>;
}
