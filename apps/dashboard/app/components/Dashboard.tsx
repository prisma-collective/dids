'use client';

import { useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { WalletPicker } from './WalletPicker';
import { NetworkSelector, Network } from './NetworkSelector';
import { DIDManager } from './DIDManager';

export function Dashboard() {
  const { connectedWallet } = useWallet();
  const [network, setNetwork] = useState<Network>(
    (process.env.NEXT_PUBLIC_DEFAULT_NETWORK as Network) || 'preprod'
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Prisma DIDs</h1>
        <p className="subtitle">W3C Decentralized Identifiers on Cardano</p>
      </header>

      <div className="dashboard-controls">
        <NetworkSelector
          network={network}
          onChange={setNetwork}
          disabled={!!connectedWallet}
        />
        <WalletPicker />
      </div>

      <main className="dashboard-main">
        {connectedWallet ? (
          <DIDManager wallet={connectedWallet} network={network} />
        ) : (
          <div className="connect-prompt">
            <h2>Get Started</h2>
            <p>Connect your Cardano wallet to create or manage your DID.</p>
            <ul className="features-list">
              <li>Create W3C-compliant DIDs</li>
              <li>Anchor to your stake address</li>
              <li>Store DID Documents on IPFS</li>
              <li>Update and revoke as needed</li>
            </ul>
          </div>
        )}
      </main>

      <footer className="dashboard-footer">
        <p>
          <a
            href="https://github.com/anthropics/prisma-dids"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
          {' | '}
          <span className="network-badge">{network}</span>
        </p>
      </footer>
    </div>
  );
}
