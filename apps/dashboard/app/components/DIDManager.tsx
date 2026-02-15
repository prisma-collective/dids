'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { ConnectedWallet } from '../contexts/WalletContext';
import type { Network } from './NetworkSelector';
import { fetchLatestDIDEvent, DIDEventRecord } from '../services/didService';
import { CreateDID } from './CreateDID';
import { UpdateDID } from './UpdateDID';
import { RevokeDID } from './RevokeDID';
import { deriveDID, hexToBytes } from '@prisma-dids/sdk/browser';
import {
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Badge,
  Button,
  ErrorState,
  EmptyState,
  Card,
} from '@prisma-dids/ui';
import { DIDManagerSkeleton } from './DIDManagerSkeleton';
import { ExternalLink, RefreshCw } from 'lucide-react';

async function hexStakeAddressToBech32(hexAddress: string): Promise<string> {
  const CSL = await import('@emurgo/cardano-serialization-lib-browser');
  const bytes = hexToBytes(hexAddress);
  const addr = CSL.Address.from_bytes(bytes);
  const rewardAddr = CSL.RewardAddress.from_address(addr);

  if (!rewardAddr) {
    throw new Error('Invalid stake address format');
  }

  const networkId = rewardAddr.to_address().network_id();
  const prefix = networkId === 1 ? 'stake' : 'stake_test';

  return rewardAddr.to_address().to_bech32(prefix);
}

interface DIDManagerProps {
  wallet: ConnectedWallet;
  network: Network;
}

interface DIDStatus {
  loading: boolean;
  did: string | null;
  currentEvent: DIDEventRecord | null;
  error: string | null;
}

export function DIDManager({ wallet, network }: DIDManagerProps) {
  const t = useTranslations('didManager');
  const [activeTab, setActiveTab] = useState('status');
  const [status, setStatus] = useState<DIDStatus>({
    loading: true,
    did: null,
    currentEvent: null,
    error: null,
  });

  const checkDIDStatus = useCallback(async () => {
    console.log('[DIDManager] Starting checkDIDStatus...');
    setStatus(prev => ({ ...prev, loading: true, error: null }));

    try {
      const rewardAddresses = await wallet.api.getRewardAddresses();

      if (!rewardAddresses || rewardAddresses.length === 0) {
        setStatus({
          loading: false,
          did: null,
          currentEvent: null,
          error: t('errors.noStakeAddress'),
        });
        return;
      }

      const stakeAddressHex = rewardAddresses[0];
      const stakeAddressBech32 = await hexStakeAddressToBech32(stakeAddressHex);
      const did = deriveDID(stakeAddressBech32);

      const currentEvent = await fetchLatestDIDEvent(did, network);

      setStatus({
        loading: false,
        did,
        currentEvent,
        error: null,
      });

      if (!currentEvent) {
        setActiveTab('create');
      } else {
        setActiveTab('status');
      }

    } catch (err) {
      console.error('[DIDManager] Error:', err);
      setStatus({
        loading: false,
        did: null,
        currentEvent: null,
        error: err instanceof Error ? err.message : t('errors.checkFailed'),
      });
    }
  }, [wallet, network]);

  useEffect(() => {
    checkDIDStatus();
  }, [checkDIDStatus]);

  const handleOperationComplete = () => {
    checkDIDStatus();
    setActiveTab('status');
  };

  const getExplorerUrl = (txHash: string) => {
    const base = network === 'mainnet'
      ? 'https://cardanoscan.io'
      : 'https://preprod.cardanoscan.io';
    return `${base}/transaction/${txHash}`;
  };

  if (status.loading) {
    return <DIDManagerSkeleton />;
  }

  if (status.error) {
    return (
      <ErrorState
        message={status.error}
        onRetry={checkDIDStatus}
      />
    );
  }

  const isRevoked = status.currentEvent?.event.action === 'revoke';
  const hasExistingDID = status.currentEvent !== null;

  return (
    <div className="w-full">
      <Tabs value={activeTab} defaultValue="status" onValueChange={setActiveTab}>
        <TabList>
          <Tab value="status">{t('tabs.status')}</Tab>
          {!hasExistingDID && <Tab value="create">{t('tabs.create')}</Tab>}
          {hasExistingDID && !isRevoked && (
            <>
              <Tab value="update">{t('tabs.update')}</Tab>
              <Tab value="revoke">{t('tabs.revoke')}</Tab>
            </>
          )}
        </TabList>

        <TabPanel value="status">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {t('yourStatus')}
            </h3>

            <div className="text-left space-y-3 mb-4">
              {/* DID */}
              <Card className="p-3">
                <label className="block text-xs text-text-secondary uppercase mb-1">DID</label>
                <code className="text-sm break-all text-text-primary">{status.did}</code>
              </Card>

              {hasExistingDID ? (
                <>
                  {/* Status */}
                  <Card className="p-3 flex items-center justify-between">
                    <label className="text-xs text-text-secondary uppercase">{t('statusLabel')}</label>
                    <Badge variant={isRevoked ? 'error' : 'success'} dot>
                      {isRevoked ? t('revoked') : t('active')}
                    </Badge>
                  </Card>

                  {/* Version */}
                  <Card className="p-3 flex items-center justify-between">
                    <label className="text-xs text-text-secondary uppercase">{t('version')}</label>
                    <code className="text-sm text-text-primary">{status.currentEvent!.event.v}</code>
                  </Card>

                  {/* Last Action */}
                  <Card className="p-3 flex items-center justify-between">
                    <label className="text-xs text-text-secondary uppercase">{t('lastAction')}</label>
                    <code className="text-sm text-text-primary">{status.currentEvent!.event.action}</code>
                  </Card>

                  {/* IPFS CID */}
                  <Card className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-text-secondary uppercase">IPFS CID</label>
                      <a
                        href={`https://gateway.pinata.cloud/ipfs/${status.currentEvent!.event.ipfs}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-xs hover:underline inline-flex items-center gap-1"
                      >
                        {t('view')} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <code className="text-sm break-all text-text-primary">{status.currentEvent!.event.ipfs}</code>
                  </Card>

                  {/* Last Tx */}
                  <Card className="p-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-text-secondary uppercase">{t('lastTx')}</label>
                      <a
                        href={getExplorerUrl(status.currentEvent!.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-sm hover:underline inline-flex items-center gap-1"
                      >
                        {status.currentEvent!.txHash.substring(0, 20)}...
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </Card>
                </>
              ) : (
                <EmptyState
                  title={t('noDIDTitle')}
                  description={t('noDIDDescription')}
                  action={
                    <Button onClick={() => setActiveTab('create')}>
                      {t('createYourDID')}
                    </Button>
                  }
                />
              )}
            </div>

            {hasExistingDID && !isRevoked && (
              <div className="flex flex-col sm:flex-row justify-center gap-3 mt-4">
                <Button variant="secondary" onClick={() => setActiveTab('update')}>
                  {t('updateDIDButton')}
                </Button>
                <Button variant="danger" onClick={() => setActiveTab('revoke')}>
                  {t('revokeDIDButton')}
                </Button>
              </div>
            )}

            {isRevoked && (
              <div role="alert" className="mt-4 p-3 bg-error/10 rounded-lg text-error text-sm text-center">
                {t('revokedMessage')}
              </div>
            )}

            <button
              type="button"
              onClick={checkDIDStatus}
              className="mt-4 text-sm text-text-secondary hover:text-primary transition-colors inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary outline-none rounded px-3 py-2.5 min-h-[44px]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('refresh')}
            </button>
          </div>
        </TabPanel>

        {!hasExistingDID && (
          <TabPanel value="create">
            <CreateDID
              wallet={wallet}
              network={network}
              onComplete={handleOperationComplete}
            />
          </TabPanel>
        )}

        {hasExistingDID && !isRevoked && (
          <>
            <TabPanel value="update">
              {status.did && (
                <UpdateDID
                  wallet={wallet}
                  network={network}
                  currentDID={status.did}
                  onComplete={handleOperationComplete}
                />
              )}
            </TabPanel>

            <TabPanel value="revoke">
              {status.did && (
                <RevokeDID
                  wallet={wallet}
                  network={network}
                  currentDID={status.did}
                  onComplete={handleOperationComplete}
                />
              )}
            </TabPanel>
          </>
        )}
      </Tabs>
    </div>
  );
}
