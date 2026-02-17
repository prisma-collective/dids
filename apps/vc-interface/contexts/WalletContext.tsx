'use client';

/**
 * CIP-30 Wallet Context — manages Cardano wallet connection.
 *
 * Provides: wallet API, signing address, DID, connect/disconnect.
 * Auto-reconnects from localStorage on mount.
 * DID derivation: reward address hex → bech32 → did:cardano:stake...
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { CIP30API } from '@prisma-dids/types';

// ─── CIP-30 Window Types ───

interface CIP30WalletEntry {
  name: string;
  icon: string;
  apiVersion: string;
  enable(): Promise<CIP30API>;
  isEnabled(): Promise<boolean>;
}

declare global {
  interface Window {
    cardano?: Record<string, CIP30WalletEntry>;
  }
}

// ─── Context Types ───

export interface WalletState {
  /** CIP-30 wallet API (null if disconnected) */
  wallet: CIP30API | null;
  /** Hex-encoded signing address (first used address) */
  signingAddress: string | null;
  /** Holder/issuer DID derived from stake address */
  did: string | null;
  /** Currently connecting */
  connecting: boolean;
  /** Last error message */
  error: string | null;
  /** Name of connected wallet provider */
  walletName: string | null;
  /** Connect to a wallet by provider name */
  connect: (walletName: string) => Promise<void>;
  /** Disconnect wallet */
  disconnect: () => void;
  /** Available CIP-30 wallet providers detected in window.cardano */
  availableWallets: Array<{ name: string; icon: string }>;
}

const STORAGE_KEY = 'prisma-vc-wallet';

const WalletContext = createContext<WalletState | null>(null);

// ─── DID Derivation ───

/**
 * Convert reward address hex → bech32 stake address → DID.
 * Uses dynamic import of lucid-cardano to avoid SSR issues with WASM.
 */
async function deriveDidFromRewardAddress(rewardHex: string): Promise<string> {
  const { C } = await import('lucid-cardano');
  const bytes = Uint8Array.from(rewardHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  const addr = C.Address.from_bytes(bytes);
  // Header byte 0xe0 = mainnet reward, 0xe1 = testnet reward
  const prefix = (bytes[0]! & 0x0f) === 0x01 ? 'stake' : 'stake_test';
  const bech32 = addr.to_bech32(prefix);
  return `did:cardano:${bech32}`;
}

// ─── Provider ───

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<CIP30API | null>(null);
  const [signingAddress, setSigningAddress] = useState<string | null>(null);
  const [did, setDid] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<Array<{ name: string; icon: string }>>([]);

  // Detect available wallets
  useEffect(() => {
    const detect = () => {
      if (typeof window === 'undefined' || !window.cardano) return;
      const wallets: Array<{ name: string; icon: string }> = [];
      for (const [key, entry] of Object.entries(window.cardano)) {
        if (entry && typeof entry.enable === 'function' && typeof entry.name === 'string') {
          wallets.push({ name: key, icon: entry.icon || '' });
        }
      }
      setAvailableWallets(wallets);
    };
    // Wallets inject into window.cardano asynchronously
    detect();
    const timer = setTimeout(detect, 1000);
    return () => clearTimeout(timer);
  }, []);

  const connect = useCallback(async (name: string) => {
    setConnecting(true);
    setError(null);
    try {
      if (typeof window === 'undefined' || !window.cardano?.[name]) {
        throw new Error(`Wallet "${name}" not found. Is the extension installed?`);
      }

      const api = await window.cardano[name].enable();

      // Get signing address (base address) — same pattern as DID Dashboard
      const usedAddresses = await api.getUsedAddresses();
      const addr = usedAddresses[0] || (await api.getChangeAddress());
      if (!addr) throw new Error('No address found in wallet');

      // Derive DID from reward (stake) address
      const rewardAddresses = await api.getRewardAddresses();
      if (!rewardAddresses[0]) throw new Error('No reward address found');
      const derivedDid = await deriveDidFromRewardAddress(rewardAddresses[0]);

      setWallet(api);
      setSigningAddress(addr);
      setDid(derivedDid);
      setWalletName(name);

      // Persist for auto-reconnect
      try { localStorage.setItem(STORAGE_KEY, name); } catch {}
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(msg);
      setWallet(null);
      setSigningAddress(null);
      setDid(null);
      setWalletName(null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setSigningAddress(null);
    setDid(null);
    setWalletName(null);
    setError(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  // Auto-reconnect from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && window.cardano?.[saved]) {
        connect(saved);
      }
    } catch {}
  }, [connect]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        signingAddress,
        did,
        connecting,
        error,
        walletName,
        connect,
        disconnect,
        availableWallets,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
