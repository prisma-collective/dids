'use client';

import { useTranslations } from 'next-intl';
import { useWallet, WalletInfo } from '../contexts/WalletContext';
import { Button, Badge, cn } from '@prisma-dids/ui';

interface WalletPickerProps {
  onConnected?: () => void;
}

export function WalletPicker({ onConnected }: WalletPickerProps) {
  const { availableWallets, connectedWallet, isConnecting, error, connect, disconnect } = useWallet();
  const t = useTranslations('wallet');

  const handleConnect = async (wallet: WalletInfo) => {
    await connect(wallet.name);
    onConnected?.();
  };

  if (connectedWallet) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {connectedWallet.info.icon && (
            <img
              src={connectedWallet.info.icon}
              alt={connectedWallet.info.name}
              className="w-6 h-6 rounded"
            />
          )}
          <span className="text-sm font-medium text-text-primary">{connectedWallet.info.name}</span>
          <Badge variant="success" dot>{t('connected')}</Badge>
        </div>
        <Button variant="secondary" size="sm" onClick={disconnect}>
          {t('disconnect')}
        </Button>
      </div>
    );
  }

  if (availableWallets.length === 0) {
    return (
      <div>
        <h3 className="text-base font-medium text-text-primary mb-2">{t('connect')}</h3>
        <div className="text-sm text-text-secondary">
          <p>{t('noWallets')}</p>
          <p className="mt-1 text-xs text-text-muted">
            {t('installHint')}{' '}
            <a href="https://eternl.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Eternl</a>,{' '}
            <a href="https://www.lace.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Lace</a>, or{' '}
            <a href="https://namiwallet.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Nami</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-base font-medium text-text-primary mb-2">{t('connect')}</h3>
      {error && (
        <div role="alert" className="text-sm text-error bg-error/10 px-3 py-2 rounded-lg mb-2">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-2" role="list" aria-label={t('connect')}>
        {availableWallets.map((wallet) => (
          <button
            key={wallet.name}
            type="button"
            onClick={() => handleConnect(wallet)}
            disabled={isConnecting}
            role="listitem"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg',
              'bg-background border border-border',
              'text-text-primary text-sm',
              'transition-colors hover:border-primary hover:bg-surface',
              'focus-visible:ring-2 focus-visible:ring-primary outline-none',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {wallet.icon && (
              <img src={wallet.icon} alt={wallet.name} className="w-6 h-6 rounded" />
            )}
            <span>{wallet.name}</span>
            {isConnecting && <span className="text-text-muted text-xs">...</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
