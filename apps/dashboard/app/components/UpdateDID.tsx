'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ConnectedWallet } from '../contexts/WalletContext';
import type { Network } from './NetworkSelector';
import { fetchLatestDIDEvent, DIDEventRecord } from '../services/didService';
import {
  generateDIDDocument,
  buildUpdatePayload,
  signDIDPayload,
  buildDIDEvent,
  PinataClient,
  hexToBytes,
  serializeDIDMetadata,
} from '@prisma-dids/sdk/browser';
import { Lucid, Blockfrost } from 'lucid-cardano';
import { L_DID } from '@prisma-dids/types';
import type { DIDEvent } from '@prisma-dids/types';
import {
  Button,
  Input,
  Card,
  Modal,
  ProgressSteps,
} from '@prisma-dids/ui';
import { CheckCircle, AlertCircle, ExternalLink, HelpCircle } from 'lucide-react';

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

interface UpdateDIDProps {
  wallet: ConnectedWallet;
  network: Network;
  currentDID?: string;
  onComplete?: () => void;
}

type Step =
  | 'idle'
  | 'fetching-current'
  | 'generating-doc'
  | 'pinning-ipfs'
  | 'signing'
  | 'submitting-tx'
  | 'complete'
  | 'error';

interface UpdateDIDState {
  step: Step;
  currentEvent?: DIDEventRecord;
  newIpfsCid?: string;
  txHash?: string;
  error?: string;
}

const stepOrder: Step[] = [
  'fetching-current',
  'generating-doc',
  'pinning-ipfs',
  'signing',
  'submitting-tx',
];

export function UpdateDID({ wallet, network, currentDID, onComplete }: UpdateDIDProps) {
  const [did, setDid] = useState(currentDID || '');
  const [state, setState] = useState<UpdateDIDState>({ step: 'idle' });
  const [serviceEndpoint, setServiceEndpoint] = useState('');
  const [showEndpointHelp, setShowEndpointHelp] = useState(false);
  const t = useTranslations('updateDID');

  const handleUpdate = async () => {
    if (!did) {
      setState({ step: 'error', error: t('errors.noDID') });
      return;
    }

    setState({ step: 'fetching-current' });

    try {
      // — fetching-current: fetch state, get addresses, verify ownership, preliminary sign —
      const { event: currentEvent } = await fetchLatestDIDEvent(did, network);
      if (!currentEvent) {
        throw new Error(t('errors.didNotFound'));
      }
      if (currentEvent.event.action === 'revoke') {
        throw new Error(t('errors.didRevoked'));
      }

      setState(prev => ({ ...prev, currentEvent }));

      const rewardAddresses = await wallet.api.getRewardAddresses();
      if (!rewardAddresses || rewardAddresses.length === 0) throw new Error(t('errors.noRewardAddresses'));
      const usedAddresses = await wallet.api.getUsedAddresses();
      if (!usedAddresses || usedAddresses.length === 0) throw new Error(t('errors.noUsedAddresses'));

      const baseAddressHex = usedAddresses[0];
      const stakeAddressHex = rewardAddresses[0];
      const stakeAddressBech32 = await hexStakeAddressToBech32(stakeAddressHex);
      const expectedDID = `did:cardano:${stakeAddressBech32}`;
      if (did !== expectedDID) {
        throw new Error(t('errors.walletMismatch'));
      }

      const preliminaryPayload = buildUpdatePayload({
        did, ipfsCid: 'pending', prevTxHash: currentEvent.txHash, version: currentEvent.event.v + 1,
      });
      const preliminarySig = await signDIDPayload(wallet.api, preliminaryPayload, baseAddressHex);
      const publicKeyHex = preliminarySig.key;

      // — generating-doc —
      setState(prev => ({ ...prev, step: 'generating-doc' }));
      const didDocument = generateDIDDocument({
        did, publicKeyHex, serviceEndpoint: serviceEndpoint || undefined,
      });

      // — pinning-ipfs —
      setState(prev => ({ ...prev, step: 'pinning-ipfs' }));
      const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT;
      if (!pinataJwt) throw new Error('Pinata JWT not configured.');
      const pinata = new PinataClient({ jwt: pinataJwt });
      const ipfsCid = await pinata.pinJSON(didDocument);
      setState(prev => ({ ...prev, newIpfsCid: ipfsCid }));

      // — signing: build final payload + sign —
      setState(prev => ({ ...prev, step: 'signing' }));
      const updatePayload = buildUpdatePayload({
        did, ipfsCid, prevTxHash: currentEvent.txHash, version: currentEvent.event.v + 1,
      });
      const payloadSig = await signDIDPayload(wallet.api, updatePayload, baseAddressHex);
      const didEvent: DIDEvent = buildDIDEvent(updatePayload, payloadSig);

      // — submitting-tx —
      setState(prev => ({ ...prev, step: 'submitting-tx' }));
      const blockfrostKey = network === 'mainnet'
        ? process.env.NEXT_PUBLIC_BLOCKFROST_MAINNET_KEY
        : process.env.NEXT_PUBLIC_BLOCKFROST_PREPROD_KEY;
      if (!blockfrostKey) throw new Error(`Blockfrost API key not configured for ${network}`);

      const lucid = await Lucid.new(
        new Blockfrost(`https://cardano-${network}.blockfrost.io/api/v0`, blockfrostKey),
        network === 'mainnet' ? 'Mainnet' : 'Preprod'
      );
      lucid.selectWallet(wallet.api as any);

      const metadata = serializeDIDMetadata(didEvent);
      const tx = await lucid.newTx().attachMetadata(L_DID, metadata[L_DID]).complete();
      const signedTx = await tx.sign().complete();
      const txHash = await signedTx.submit();

      setState({ step: 'complete', currentEvent, newIpfsCid: ipfsCid, txHash });
      onComplete?.();

    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.unknown');
      setState({ step: 'error', error: message });
    }
  };

  const handleReset = () => {
    setState({ step: 'idle' });
  };

  const stepLabels: Record<string, string> = {
    'fetching-current': t('steps.fetchingCurrent'),
    'generating-doc': t('steps.generatingDoc'),
    'pinning-ipfs': t('steps.pinningIPFS'),
    'signing': t('steps.signing'),
    'submitting-tx': t('steps.submittingTx'),
  };

  const progressSteps = stepOrder.map((s) => ({
    id: s,
    label: stepLabels[s] || s,
  }));

  const getExplorerUrl = (txHash: string) => {
    const base = network === 'mainnet' ? 'https://cardanoscan.io' : 'https://preprod.cardanoscan.io';
    return `${base}/transaction/${txHash}`;
  };

  if (state.step === 'error') {
    return (
      <div className="py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-error/15 animate-scale-in flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-error" />
          </div>
          <h3 className="text-lg font-semibold text-error">{t('errorTitle')}</h3>
        </div>
        <div role="alert" className="text-sm text-error bg-error/10 px-4 py-3 rounded-lg mb-4">
          {state.error}
        </div>
        <Button onClick={handleReset}>{t('tryAgain')}</Button>
      </div>
    );
  }

  if (state.step === 'complete') {
    return (
      <div className="py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-success/15 animate-scale-in flex-shrink-0">
            <CheckCircle className="h-5 w-5 text-success" />
          </div>
          <h3 className="text-lg font-semibold text-success">{t('successTitle')}</h3>
        </div>

        <div className="space-y-3 mb-6">
          <Card className="p-4">
            <label className="block text-xs text-text-secondary uppercase mb-1">DID</label>
            <code className="text-sm break-all text-text-primary">{did}</code>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <label className="text-xs text-text-secondary uppercase">{t('newVersion')}</label>
            <code className="text-sm text-text-primary">
              {state.currentEvent ? state.currentEvent.event.v + 1 : 'N/A'}
            </code>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-text-secondary uppercase">{t('newIPFS')}</label>
              <a
                href={`https://gateway.pinata.cloud/ipfs/${state.newIpfsCid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-xs hover:underline inline-flex items-center gap-1"
              >
                {t('viewIPFS')} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <code className="text-sm break-all text-text-primary">{state.newIpfsCid}</code>
          </Card>

          {state.txHash && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-text-secondary uppercase">{t('transaction')}</label>
                <a
                  href={getExplorerUrl(state.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-xs hover:underline inline-flex items-center gap-1"
                >
                  {t('viewExplorer')} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <code className="text-sm break-all text-text-primary">{state.txHash}</code>
            </Card>
          )}
        </div>

        <Button variant="secondary" onClick={handleReset}>{t('done')}</Button>
      </div>
    );
  }

  const isProcessing = state.step !== 'idle';

  return (
    <div className="py-4">
      <Card className="p-5">
        <h3 className="text-xl font-semibold text-text-primary mb-2">{t('title')}</h3>
        <p className="text-text-secondary mb-6">{t('description')}</p>

        <div className="space-y-4 mb-6">
          <div>
            <label htmlFor="did-input" className="block text-sm text-text-secondary mb-1.5">
              {t('didToUpdate')}
            </label>
            <Input
              id="did-input"
              value={did}
              readOnly
              className="opacity-70 cursor-not-allowed"
              placeholder="did:cardano:stake_test1..."
              disabled={isProcessing}
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label htmlFor="service-endpoint" className="text-sm text-text-secondary">
                {t('serviceEndpoint')}
              </label>
              <button
                type="button"
                onClick={() => setShowEndpointHelp(true)}
                aria-label={t('endpointHelp.title')}
                className="p-0.5 rounded text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>
            <Input
              id="service-endpoint"
              value={serviceEndpoint}
              onChange={(e) => setServiceEndpoint(e.target.value)}
              placeholder="https://api.example.com"
              disabled={isProcessing}
            />

            <Modal
              open={showEndpointHelp}
              onClose={() => setShowEndpointHelp(false)}
              title={t('endpointHelp.title')}
              className="max-w-md"
            >
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-1">
                    {t('endpointHelp.whatQ')}
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {t('endpointHelp.whatA')}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-text-primary">
                      {t('endpointHelp.whyQ')}
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {t('endpointHelp.advanced')}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {t('endpointHelp.whyA')}
                  </p>
                </div>
              </div>
            </Modal>
          </div>
        </div>

        {isProcessing ? (
          <ProgressSteps steps={progressSteps} currentStep={state.step} />
        ) : (
          <Button onClick={handleUpdate}>{t('updateButton')}</Button>
        )}
      </Card>
    </div>
  );
}
