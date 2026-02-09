'use client';

import { useWallet, WalletInfo } from '../contexts/WalletContext';

interface WalletPickerProps {
  onConnected?: () => void;
}

export function WalletPicker({ onConnected }: WalletPickerProps) {
  const { availableWallets, connectedWallet, isConnecting, error, connect, disconnect } = useWallet();

  const handleConnect = async (wallet: WalletInfo) => {
    await connect(wallet.name);
    onConnected?.();
  };

  if (connectedWallet) {
    return (
      <div className="wallet-connected">
        <div className="wallet-info">
          {connectedWallet.info.icon && (
            <img
              src={connectedWallet.info.icon}
              alt={connectedWallet.info.name}
              className="wallet-icon"
            />
          )}
          <span className="wallet-name">{connectedWallet.info.name}</span>
          <span className="wallet-status">Connected</span>
        </div>
        <button onClick={disconnect} className="btn btn-secondary">
          Disconnect
        </button>
      </div>
    );
  }

  if (availableWallets.length === 0) {
    return (
      <div className="wallet-picker">
        <h3>Connect Wallet</h3>
        <div className="no-wallets">
          <p>No Cardano wallets detected.</p>
          <p className="hint">
            Please install a CIP-30 compatible wallet like{' '}
            <a href="https://eternl.io" target="_blank" rel="noopener noreferrer">Eternl</a>,{' '}
            <a href="https://www.lace.io" target="_blank" rel="noopener noreferrer">Lace</a>, or{' '}
            <a href="https://namiwallet.io" target="_blank" rel="noopener noreferrer">Nami</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-picker">
      <h3>Connect Wallet</h3>
      {error && <div className="error-message">{error}</div>}
      <div className="wallet-list">
        {availableWallets.map((wallet) => (
          <button
            key={wallet.name}
            onClick={() => handleConnect(wallet)}
            disabled={isConnecting}
            className="wallet-button"
          >
            {wallet.icon && (
              <img
                src={wallet.icon}
                alt={wallet.name}
                className="wallet-icon"
              />
            )}
            <span className="wallet-name">{wallet.name}</span>
            {isConnecting && <span className="loading">...</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
