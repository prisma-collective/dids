'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { ConnectedWallet } from '../contexts/WalletContext';
import type { Network } from './NetworkSelector';
import { fetchLatestDIDEvent, DIDEventRecord, ServiceEntry } from '../services/didService';
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
  CopyButton,
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
  services: ServiceEntry[];
  error: string | null;
}

export function DIDManager({ wallet, network }: DIDManagerProps) {
  const t = useTranslations('didManager');
  const [activeTab, setActiveTab] = useState('status');
  const [status, setStatus] = useState<DIDStatus>({
    loading: true,
    did: null,
    currentEvent: null,
    services: [],
    error: null,
  });

  // Use refs for wallet/network to avoid re-creating the callback on every render
  const walletRef = useRef(wallet);
  const networkRef = useRef(network);
  walletRef.current = wallet;
  networkRef.current = network;

  const checkDIDStatus = useCallback(async () => {
    // Only show skeleton on first load — subsequent fetches keep showing stale data
    setStatus(prev => prev.did ? { ...prev, error: null } : { ...prev, loading: true, error: null });

    try {
      const rewardAddresses = await walletRef.current.api.getRewardAddresses();

      if (!rewardAddresses || rewardAddresses.length === 0) {
        setStatus({
          loading: false,
          did: null,
          currentEvent: null,
          services: [],
          error: t('errors.noStakeAddress'),
        });
        return;
      }

      const stakeAddressHex = rewardAddresses[0];
      const stakeAddressBech32 = await hexStakeAddressToBech32(stakeAddressHex);
      const did = deriveDID(stakeAddressBech32);

      const { event: currentEvent, services } = await fetchLatestDIDEvent(did, networkRef.current);

      setStatus({
        loading: false,
        did,
        currentEvent,
        services,
        error: null,
      });

      if (!currentEvent) {
        setActiveTab('create');
      } else {
        setActiveTab('status');
      }

    } catch (err) {
      console.error('[DIDManager] Error:', err);
      setStatus(prev => ({
        loading: false,
        did: prev.did,
        currentEvent: prev.currentEvent,
        services: prev.services,
        error: err instanceof Error ? err.message : t('errors.checkFailed'),
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch on mount and when network actually changes
  const prevNetworkRef = useRef(network);
  useEffect(() => {
    if (prevNetworkRef.current !== network) {
      prevNetworkRef.current = network;
      setStatus({ loading: true, did: null, currentEvent: null, services: [], error: null });
    }
    checkDIDStatus();
  }, [network, checkDIDStatus]);

  const [syncing, setSyncing] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleOperationComplete = () => {
    // Clear any existing polling interval to prevent overlaps
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    const prevVersion = status.currentEvent?.event.v ?? 0;
    const wasCreation = !status.currentEvent; 
    setSyncing(true);
    setActiveTab('status');

    // Poll every 5s until version changes or 90s timeout
    let elapsed = 0;
    const poll = setInterval(async () => {
      elapsed += 5000;
      if (elapsed > 90_000) {
        clearInterval(poll);
        pollingRef.current = null;
        setSyncing(false);
        return;
      }
      try {
        const rewardAddresses = await wallet.api.getRewardAddresses();
        if (!rewardAddresses?.length) return;
        const hex = rewardAddresses[0];
        const bech32 = await hexStakeAddressToBech32(hex);
        const did = deriveDID(bech32);
        const { event } = await fetchLatestDIDEvent(did, network);
        if (event && event.event.v > prevVersion) {
          clearInterval(poll);
          pollingRef.current = null;
          setSyncing(false);
          checkDIDStatus();
        }
      } catch {
        // Keep polling on transient errors
      }
    }, 5000);
    pollingRef.current = poll;
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
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {t('yourStatus')}
            </h3>

            <div className="space-y-3">
              {/* DID */}
              <Card className="p-4">
                <label className="block text-xs text-text-secondary uppercase tracking-wide mb-1.5">DID</label>
                <div className="flex items-start gap-1.5">
                  <code className="text-sm break-all text-text-primary">{status.did}</code>
                  {status.did && <CopyButton value={status.did} />}
                </div>
              </Card>

              {hasExistingDID ? (
                <>
                  {/* Status */}
                  <Card className="p-4 flex items-center justify-between">
                    <label className="text-xs text-text-secondary uppercase tracking-wide">{t('statusLabel')}</label>
                    <Badge variant={isRevoked ? 'error' : 'success'} dot>
                      {isRevoked ? t('revoked') : t('active')}
                    </Badge>
                  </Card>

                  {/* Version */}
                  <Card className="p-4 flex items-center justify-between">
                    <label className="text-xs text-text-secondary uppercase tracking-wide">{t('version')}</label>
                    <code className="text-sm text-text-primary">{status.currentEvent!.event.v}</code>
                  </Card>

                  {/* Last Action */}
                  <Card className="p-4 flex items-center justify-between">
                    <label className="text-xs text-text-secondary uppercase tracking-wide">{t('lastAction')}</label>
                    <code className="text-sm text-text-primary">{status.currentEvent!.event.action}</code>
                  </Card>

                  {/* IPFS CID */}
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-text-secondary uppercase tracking-wide">IPFS CID</label>
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

                  {/* Service Endpoints */}
                  {status.services.length > 0 && (
                    <Card className="p-4">
                      <label className="block text-xs text-text-secondary uppercase tracking-wide mb-1.5">
                        {t('serviceEndpoint')}
                      </label>
                      <div className="space-y-2">
                        {status.services.map((svc) => (
                          <div key={svc.id} className="flex items-center justify-between">
                            <code className="text-sm text-text-primary break-all">{svc.serviceEndpoint}</code>
                            <a
                              href={svc.serviceEndpoint}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary text-xs hover:underline inline-flex items-center gap-1 ml-2 flex-shrink-0"
                            >
                              {t('view')} <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Last Tx */}
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-text-secondary uppercase tracking-wide">{t('lastTx')}</label>
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
              <div className="flex flex-col sm:flex-row justify-center gap-3 mt-6">
                <Button variant="secondary" onClick={() => setActiveTab('update')}>
                  {t('updateDIDButton')}
                </Button>
                <Button variant="danger" onClick={() => setActiveTab('revoke')}>
                  {t('revokeDIDButton')}
                </Button>
              </div>
            )}

            {isRevoked && (
              <div role="alert" className="mt-6 p-4 bg-error/10 rounded-lg text-error text-sm text-center">
                {t('revokedMessage')}
              </div>
            )}

            {syncing && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-primary animate-pulse">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {t('syncing')}
              </div>
            )}

            <div className="flex justify-center mt-2">
              <button
                type="button"
                onClick={checkDIDStatus}
                className="text-sm text-text-secondary hover:text-primary transition-colors inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary outline-none rounded px-3 py-2.5 min-h-[44px]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('refresh')}
              </button>
            </div>
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
