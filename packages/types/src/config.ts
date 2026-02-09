// Network and provider configuration types

export type Network = 'Preprod' | 'Mainnet';

export interface NetworkConfig {
  network: Network;
  blockfrostApiKey: string;
}

// PinataConfig supports either API key/secret OR JWT authentication
export type PinataConfig =
  | { apiKey: string; apiSecret: string; jwt?: never }
  | { jwt: string; apiKey?: never; apiSecret?: never };
