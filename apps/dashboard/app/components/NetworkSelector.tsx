'use client';

export type Network = 'preprod' | 'mainnet';

interface NetworkSelectorProps {
  network: Network;
  onChange: (network: Network) => void;
  disabled?: boolean;
}

export function NetworkSelector({ network, onChange, disabled }: NetworkSelectorProps) {
  return (
    <div className="network-selector">
      <label className="network-label">Network:</label>
      <div className="network-toggle">
        <button
          onClick={() => onChange('preprod')}
          disabled={disabled}
          className={`network-btn ${network === 'preprod' ? 'active' : ''}`}
        >
          Preprod
        </button>
        <button
          onClick={() => onChange('mainnet')}
          disabled={disabled}
          className={`network-btn ${network === 'mainnet' ? 'active' : ''}`}
        >
          Mainnet
        </button>
      </div>
      {network === 'mainnet' && (
        <span className="network-warning">Real ADA will be used</span>
      )}
    </div>
  );
}
