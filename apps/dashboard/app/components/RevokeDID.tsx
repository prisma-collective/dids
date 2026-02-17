'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ConnectedWallet } from '../contexts/WalletContext';
import type { Network } from './NetworkSelector';
import { fetchLatestDIDEvent, DIDEventRecord } from '../services/didService';
import {
  buildRevokePayload,
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
import { AlertTriangle, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';

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

interface RevokeDIDProps {
  wallet: ConnectedWallet;
  network: Network;
  currentDID?: string;
  onComplete?: () => void;
}

type Step =
  | 'idle'
  | 'confirm'
  | 'fetching-current'
  | 'pinning-ipfs'
  | 'building-payload'
  | 'signing'
  | 'submitting-tx'
  | 'complete'
  | 'error';

interface RevokeDIDState {
  step: Step;
  currentEvent?: DIDEventRecord;
  revokedCid?: string;
  txHash?: string;
  error?: string;
}

const stepOrder: Step[] = [
  'fetching-current',
  'pinning-ipfs',
  'building-payload',
  'signing',
  'submitting-tx',
];

export function RevokeDID({ wallet, network, currentDID, onComplete }: RevokeDIDProps) {
  const [did, setDid] = useState(currentDID || '');
  const [state, setState] = useState<RevokeDIDState>({ step: 'idle' });
  const t = useTranslations('revokeDID');

  const handleRevoke = async () => {
    if (!did) {
      setState({ step: 'error', error: t('errors.noDID') });
      return;
    }

    if (state.step === 'idle') {
      setState({ step: 'confirm' });
      return;
    }

    setState({ step: 'fetching-current' });

    try {
      const { event: currentEvent } = await fetchLatestDIDEvent(did, network);
      if (!currentEvent) throw new Error(t('errors.didNotFound'));
      if (currentEvent.event.action === 'revoke') throw new Error(t('errors.alreadyRevoked'));

      setState(prev => ({ ...prev, currentEvent }));

      const rewardAddresses = await wallet.api.getRewardAddresses();
      if (!rewardAddresses || rewardAddresses.length === 0) throw new Error(t('errors.noRewardAddresses'));
      const usedAddresses = await wallet.api.getUsedAddresses();
      if (!usedAddresses || usedAddresses.length === 0) throw new Error(t('errors.noUsedAddresses'));

      const baseAddressHex = usedAddresses[0];
      const stakeAddressHex = rewardAddresses[0];
      const stakeAddressBech32 = await hexStakeAddressToBech32(stakeAddressHex);
      const expectedDID = `did:cardano:${stakeAddressBech32}`;
      if (did !== expectedDID) throw new Error(t('errors.walletMismatch'));

      setState(prev => ({ ...prev, step: 'pinning-ipfs' }));
      const revokedDocument = {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: did,
        status: 'revoked',
        revokedAt: new Date().toISOString(),
      };

      const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT;
      if (!pinataJwt) throw new Error('Pinata JWT not configured.');
      const pinata = new PinataClient({ jwt: pinataJwt });
      const revokedCid = await pinata.pinJSON(revokedDocument);
      setState(prev => ({ ...prev, revokedCid }));

      setState(prev => ({ ...prev, step: 'building-payload' }));
      const revokePayload = buildRevokePayload({
        did, ipfsCid: revokedCid, prevTxHash: currentEvent.txHash, version: currentEvent.event.v + 1,
      });

      setState(prev => ({ ...prev, step: 'signing' }));
      const payloadSig = await signDIDPayload(wallet.api, revokePayload, baseAddressHex);
      const didEvent: DIDEvent = buildDIDEvent(revokePayload, payloadSig);

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

      setState({ step: 'complete', currentEvent, revokedCid, txHash });
      onComplete?.();

    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.unknown');
      setState({ step: 'error', error: message });
    }
  };

  const handleReset = () => {
    setState({ step: 'idle' });
  };

  const handleCancel = () => {
    setState({ step: 'idle' });
  };

  const stepLabels: Record<string, string> = {
    'fetching-current': t('steps.fetchingCurrent'),
    'pinning-ipfs': t('steps.pinningIPFS'),
    'building-payload': t('steps.buildingPayload'),
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
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-warning/15 animate-scale-in flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <h3 className="text-lg font-semibold text-warning">{t('successTitle')}</h3>
        </div>

        <div className="space-y-3 mb-6">
          <Card className="p-4">
            <label className="block text-xs text-text-secondary uppercase mb-1">DID</label>
            <code className="text-sm break-all text-text-primary">{did}</code>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <label className="text-xs text-text-secondary uppercase">{t('finalVersion')}</label>
            <code className="text-sm text-text-primary">
              {state.currentEvent ? state.currentEvent.event.v + 1 : 'N/A'}
            </code>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-text-secondary uppercase">{t('revocationCID')}</label>
              <a
                href={`https://gateway.pinata.cloud/ipfs/${state.revokedCid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-xs hover:underline inline-flex items-center gap-1"
              >
                {t('viewIPFS')} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <code className="text-sm break-all text-text-primary">{state.revokedCid}</code>
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

        <p className="text-sm text-warning mb-4">{t('revokedWarning')}</p>
        <Button variant="secondary" onClick={handleReset}>{t('done')}</Button>
      </div>
    );
  }

  const isProcessing = !['idle', 'confirm'].includes(state.step);

  return (
    <div className="py-4">
      <Card className="p-5">
        <h3 className="text-xl font-semibold text-text-primary mb-2">{t('title')}</h3>
        <p className="text-warning text-sm mb-6">{t('description')}</p>

        <div className="mb-6">
          <label htmlFor="revoke-did-input" className="block text-sm text-text-secondary mb-1.5">
            {t('didToRevoke')}
          </label>
          <Input
            id="revoke-did-input"
            value={did}
            readOnly
            className="opacity-70 cursor-not-allowed"
            placeholder="did:cardano:stake_test1..."
            disabled={isProcessing}
          />
        </div>

        {isProcessing ? (
          <ProgressSteps steps={progressSteps} currentStep={state.step} />
        ) : (
          <Button variant="danger" onClick={handleRevoke}>{t('revokeButton')}</Button>
        )}
      </Card>

      {/* Confirmation Modal */}
      <Modal
        open={state.step === 'confirm'}
        onClose={handleCancel}
        title={t('confirmTitle')}
        alert
      >
        <div className="text-center py-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-warning/15 mb-3">
            <AlertTriangle className="h-6 w-6 text-warning" />
          </div>
          <p className="text-warning font-medium mb-2">{t('confirmQuestion')}</p>
          <p className="text-sm text-text-secondary mb-1">
            <strong>DID:</strong> <code className="text-xs break-all">{did}</code>
          </p>
          <p className="text-sm text-warning mb-4">{t('confirmWarning')}</p>
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={handleCancel}>{t('cancelButton')}</Button>
            <Button variant="danger" onClick={handleRevoke}>{t('confirmRevoke')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
