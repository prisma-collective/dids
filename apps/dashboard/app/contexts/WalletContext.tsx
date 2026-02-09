'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface WalletInfo {
  name: string;
  icon: string;
  apiVersion: string;
}

export interface ConnectedWallet {
  info: WalletInfo;
  api: CardanoWalletApi;
}

// CIP-30 Wallet API types
export interface CardanoWalletApi {
  getNetworkId(): Promise<number>;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getRewardAddresses(): Promise<string[]>;
  signData(addr: string, payload: string): Promise<{ signature: string; key: string }>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  submitTx(tx: string): Promise<string>;
  getUtxos(): Promise<string[] | undefined>;
  getCollateral?(): Promise<string[] | undefined>;
}

interface CardanoWindow {
  [key: string]: {
    name?: string;
    icon?: string;
    apiVersion?: string;
    enable(): Promise<CardanoWalletApi>;
    isEnabled(): Promise<boolean>;
  };
}

declare global {
  interface Window {
    cardano?: CardanoWindow;
  }
}

interface WalletContextType {
  availableWallets: WalletInfo[];
  connectedWallet: ConnectedWallet | null;
  isConnecting: boolean;
  error: string | null;
  connect: (walletName: string) => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [availableWallets, setAvailableWallets] = useState<WalletInfo[]>([]);
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWallet | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scan for available wallets
  useEffect(() => {
    const scanWallets = () => {
      if (typeof window === 'undefined' || !window.cardano) {
        setAvailableWallets([]);
        return;
      }

      const wallets: WalletInfo[] = [];
      const cardano = window.cardano;

      // Known CIP-30 wallet keys to check
      const knownWallets = ['eternl', 'nami', 'lace', 'flint', 'yoroi', 'typhon', 'gerowallet', 'nufi'];

      for (const key of knownWallets) {
        const wallet = cardano[key];
        if (wallet && typeof wallet.enable === 'function') {
          wallets.push({
            name: wallet.name || key,
            icon: wallet.icon || '',
            apiVersion: wallet.apiVersion || '0.1.0',
          });
        }
      }

      // Also check for any other wallets not in our known list
      for (const key of Object.keys(cardano)) {
        if (knownWallets.includes(key)) continue;
        const wallet = cardano[key];
        if (wallet && typeof wallet.enable === 'function' && wallet.name) {
          wallets.push({
            name: wallet.name,
            icon: wallet.icon || '',
            apiVersion: wallet.apiVersion || '0.1.0',
          });
        }
      }

      setAvailableWallets(wallets);
    };

    // Initial scan
    scanWallets();

    // Re-scan after a delay (wallets inject async)
    const timeout = setTimeout(scanWallets, 1000);
    return () => clearTimeout(timeout);
  }, []);

  const connect = useCallback(async (walletName: string) => {
    if (!window.cardano) {
      setError('No Cardano wallets detected');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Find wallet by name (case-insensitive key match)
      const walletKey = Object.keys(window.cardano).find(
        key => key.toLowerCase() === walletName.toLowerCase() ||
               window.cardano?.[key]?.name?.toLowerCase() === walletName.toLowerCase()
      );

      if (!walletKey || !window.cardano[walletKey]) {
        throw new Error(`Wallet "${walletName}" not found`);
      }

      const wallet = window.cardano[walletKey];
      const api = await wallet.enable();

      // Verify wallet supports signData (required for DID signing)
      if (typeof api.signData !== 'function') {
        throw new Error('Wallet does not support signData. Please use Eternl, Lace, or Nami.');
      }

      console.log('[WalletContext] Wallet connected:', walletKey);

      setConnectedWallet({
        info: {
          name: wallet.name || walletKey,
          icon: wallet.icon || '',
          apiVersion: wallet.apiVersion || '0.1.0',
        },
        api,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(message);
      setConnectedWallet(null);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    console.log('[WalletContext] Wallet disconnected');
    setConnectedWallet(null);
    setError(null);
  }, []);

  return (
    <WalletContext.Provider value={{
      availableWallets,
      connectedWallet,
      isConnecting,
      error,
      connect,
      disconnect,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
