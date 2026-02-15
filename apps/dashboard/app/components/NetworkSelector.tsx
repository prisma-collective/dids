'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@prisma-dids/ui';

export type Network = 'preprod' | 'mainnet';

interface NetworkSelectorProps {
  network: Network;
  onChange: (network: Network) => void;
  disabled?: boolean;
}

const networks: Network[] = ['preprod', 'mainnet'];

export function NetworkSelector({ network, onChange, disabled }: NetworkSelectorProps) {
  const t = useTranslations('common');

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-text-secondary">{t('network')}:</span>
      <div
        role="radiogroup"
        aria-label={t('network')}
        className="flex bg-background rounded-lg overflow-hidden"
      >
        {networks.map((n) => {
          const isActive = network === n;
          const isMainnet = n === 'mainnet';
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(n)}
              disabled={disabled || isMainnet}
              title={isMainnet ? 'Coming soon' : undefined}
              className={cn(
                'px-3 py-1.5 text-sm transition-colors',
                'focus-visible:ring-2 focus-visible:ring-primary outline-none',
                isActive
                  ? 'bg-primary text-white font-medium'
                  : 'text-text-secondary hover:text-text-primary',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {t(n)}
            </button>
          );
        })}
      </div>
      {network === 'mainnet' && (
        <span className="text-xs text-warning">{t('mainnetWarning')}</span>
      )}
    </div>
  );
}
