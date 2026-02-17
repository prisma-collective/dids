'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { VerifiableCredential } from '@/types/vc';
import {
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Button,
  EmptyState,
  Badge,
  cn,
} from '@prisma-dids/ui';
import { Inbox } from 'lucide-react';
import { VCCard } from './shared/VCCard';
import { CredentialCardSkeleton } from './shared/CredentialCardSkeleton';

export interface CredentialInboxProps {
  credentials: VerifiableCredential[];
  onViewCredential?: (credential: VerifiableCredential) => void;
  onShareCredential?: (credential: VerifiableCredential) => void;
  onVerifyCredential?: (credential: VerifiableCredential) => void;
  holderDid?: string;
  isLoading?: boolean;
  isWalletConnected?: boolean;
  onConnectWallet?: () => void;
}

type FilterTab = 'all' | 'active' | 'revoked';

export function CredentialInbox({
  credentials,
  onViewCredential,
  onShareCredential,
  onVerifyCredential,
  holderDid,
  isLoading = false,
  isWalletConnected = true,
  onConnectWallet,
}: CredentialInboxProps) {
  const t = useTranslations('inbox');
  const tc = useTranslations('common');
  const [activeTab, setActiveTab] = useState<string>('all');

  const filteredCredentials = credentials.filter(cred => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return cred.status === 'active';
    if (activeTab === 'revoked') return cred.status === 'revoked';
    return true;
  });

  const counts = {
    all: credentials.length,
    active: credentials.filter(c => c.status === 'active').length,
    revoked: credentials.filter(c => c.status === 'revoked').length,
  };

  if (!isWalletConnected) {
    return (
      <div className="max-w-[900px] mx-auto p-4">
        <EmptyState
          title={t('connectWallet')}
          description={t('connectWalletDesc')}
          action={
            onConnectWallet ? (
              <Button onClick={onConnectWallet}>{t('connectButton')}</Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-[900px] mx-auto p-4" aria-busy="true" aria-label={t('loadingCredentials')}>
        <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <CredentialCardSkeleton key={i} baseDelay={i * 150} />
          ))}
        </div>
      </div>
    );
  }

  const emptyTitle =
    activeTab === 'all' ? t('noCredentials') :
    activeTab === 'active' ? t('noActive') : t('noRevoked');

  const emptyDesc =
    activeTab === 'all' ? t('emptyAll') :
    t('emptyFiltered', { tab: activeTab });

  return (
    <div className="max-w-[900px] mx-auto p-4">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h2 className="text-2xl font-semibold text-text-primary">{t('title')}</h2>
        {holderDid && (
          <div className="flex items-center gap-2 px-4 py-2 bg-surface rounded-lg text-sm">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-text-secondary">{t('connected')}</span>
          </div>
        )}
      </div>

      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
        <TabList>
          <Tab value="all">
            {t('all')}
            <span className={cn(
              'ml-2 px-2 py-0.5 rounded-full text-xs',
              activeTab === 'all' ? 'bg-primary/15' : 'bg-background',
            )}>
              {counts.all}
            </span>
          </Tab>
          <Tab value="active">
            {tc('active')}
            <span className={cn(
              'ml-2 px-2 py-0.5 rounded-full text-xs',
              activeTab === 'active' ? 'bg-primary/15' : 'bg-background',
            )}>
              {counts.active}
            </span>
          </Tab>
          <Tab value="revoked">
            {tc('revoked')}
            <span className={cn(
              'ml-2 px-2 py-0.5 rounded-full text-xs',
              activeTab === 'revoked' ? 'bg-primary/15' : 'bg-background',
            )}>
              {counts.revoked}
            </span>
          </Tab>
        </TabList>

        {['all', 'active', 'revoked'].map((tab) => (
          <TabPanel key={tab} value={tab}>
            {filteredCredentials.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-8 w-8 text-text-muted" />}
                title={emptyTitle}
                description={emptyDesc}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                {filteredCredentials.map(credential => (
                  <VCCard
                    key={credential.id}
                    credential={credential}
                    onView={onViewCredential}
                    onShare={onShareCredential}
                    onVerify={onVerifyCredential}
                    isIssuerView={false}
                  />
                ))}
              </div>
            )}
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}
