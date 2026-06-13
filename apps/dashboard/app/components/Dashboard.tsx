'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useWallet } from '../contexts/WalletContext';
import { WalletPicker } from './WalletPicker';
import { NetworkSelector, Network } from './NetworkSelector';
import { DIDManager } from './DIDManager';
import {
  Container,
  PageHeader,
  Footer,
  Navbar,
  NetworkBadge,
  LanguageSwitcher,
  Button,
} from '@prisma-events/dids-ui';
import { Check, HelpCircle } from 'lucide-react';
import { HelpModal } from './HelpModal';

export function Dashboard() {
  const { connectedWallet } = useWallet();
  const t = useTranslations();
  const locale = useLocale();
  const [network, setNetwork] = useState<Network>(
    (process.env.NEXT_PUBLIC_DEFAULT_NETWORK as Network) || 'preprod'
  );
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary">
      <Navbar
        brand={
          <span className="text-lg font-bold tracking-tight">
            {t('dashboard.title')}
          </span>
        }
        links={[]}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => setHelpOpen(true)}
              aria-label={t('help.title')}
              className="p-2 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors focus-visible:ring-2 focus-visible:ring-primary outline-none"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
            <NetworkBadge network={network} />
            <LanguageSwitcher locale={locale} />
          </div>
        }
      />

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Container className="flex-1 py-6 sm:py-8">
        <PageHeader
          title={t('dashboard.title')}
          subtitle={t('dashboard.subtitle')}
        />

        {/* Controls bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 p-4 sm:p-5 bg-surface rounded-xl border border-border">
          <NetworkSelector
            network={network}
            onChange={setNetwork}
            disabled={!!connectedWallet}
          />
          <WalletPicker />
        </div>

        {/* Main content */}
        <main id="main-content" className="min-h-[360px] p-4 sm:p-6 bg-surface rounded-xl border border-border">
          {connectedWallet ? (
            <DIDManager wallet={connectedWallet} network={network} />
          ) : (
            <div className="text-center py-8 px-4">
              <h2 className="text-xl sm:text-2xl font-semibold text-text-primary mb-3">
                {t('dashboard.getStarted')}
              </h2>
              <p className="text-text-secondary mb-6">
                {t('dashboard.connectPrompt')}
              </p>
              <ul className="inline-block text-left space-y-2">
                {['createDIDs', 'anchorStake', 'storeIPFS', 'updateRevoke'].map((key) => (
                  <li key={key} className="flex items-center gap-2 text-text-secondary">
                    <Check className="h-4 w-4 text-success flex-shrink-0" />
                    {t(`dashboard.features.${key}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>
      </Container>

      <Footer network={network} />
    </div>
  );
}
