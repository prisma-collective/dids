'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ConnectedWallet } from '../contexts/WalletContext';
import type { Network } from './NetworkSelector';
import {
  deriveDID,
  generateDIDDocument,
  buildCreatePayload,
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
  Card,
  ProgressSteps,
} from '@prisma-dids/ui';
import { CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';

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

interface CreateDIDProps {
  wallet: ConnectedWallet;
  network: Network;
  onComplete?: () => void;
}

type Step =
  | 'idle'
  | 'getting-addresses'
  | 'deriving-did'
  | 'generating-doc'
  | 'pinning-ipfs'
  | 'building-payload'
  | 'signing'
  | 'submitting-tx'
  | 'complete'
  | 'error';

interface CreateDIDState {
  step: Step;
  did?: string;
  ipfsCid?: string;
  txHash?: string;
  error?: string;
}

const stepOrder: Step[] = [
  'getting-addresses',
  'deriving-did',
  'generating-doc',
  'pinning-ipfs',
  'building-payload',
  'signing',
  'submitting-tx',
];

export function CreateDID({ wallet, network, onComplete }: CreateDIDProps) {
  const [state, setState] = useState<CreateDIDState>({ step: 'idle' });
  const t = useTranslations('createDID');

  const getExplorerUrl = (txHash: string) => {
    const base = network === 'mainnet'
      ? 'https://cardanoscan.io'
      : 'https://preprod.cardanoscan.io';
    return `${base}/transaction/${txHash}`;
  };

  const handleCreate = async () => {
    setState({ step: 'getting-addresses' });

    try {
      const rewardAddresses = await wallet.api.getRewardAddresses();
      if (!rewardAddresses || rewardAddresses.length === 0) {
        throw new Error(t('errors.noRewardAddresses'));
      }

      const usedAddresses = await wallet.api.getUsedAddresses();
      if (!usedAddresses || usedAddresses.length === 0) {
        throw new Error(t('errors.noUsedAddresses'));
      }

      const baseAddressHex = usedAddresses[0];
      const stakeAddressHex = rewardAddresses[0];

      setState({ step: 'deriving-did' });
      const stakeAddressBech32 = await hexStakeAddressToBech32(stakeAddressHex);
      const did = deriveDID(stakeAddressBech32);
      setState(prev => ({ ...prev, did, step: 'building-payload' }));

      const preliminaryPayload = buildCreatePayload({ did, ipfsCid: 'pending' });

      setState(prev => ({ ...prev, step: 'signing' }));
      const preliminarySig = await signDIDPayload(wallet.api, preliminaryPayload, baseAddressHex);
      const publicKeyHex = preliminarySig.key;

      setState(prev => ({ ...prev, step: 'generating-doc' }));
      const didDocument = generateDIDDocument({ did, publicKeyHex });

      setState(prev => ({ ...prev, step: 'pinning-ipfs' }));
      const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT;
      if (!pinataJwt) {
        throw new Error('Pinata JWT not configured. Set NEXT_PUBLIC_PINATA_JWT in .env.local');
      }
      const pinata = new PinataClient({ jwt: pinataJwt });
      const ipfsCid = await pinata.pinJSON(didDocument);
      setState(prev => ({ ...prev, ipfsCid }));

      setState(prev => ({ ...prev, step: 'building-payload' }));
      const createPayload = buildCreatePayload({ did, ipfsCid });

      setState(prev => ({ ...prev, step: 'signing' }));
      const payloadSig = await signDIDPayload(wallet.api, createPayload, baseAddressHex);
      const didEvent: DIDEvent = buildDIDEvent(createPayload, payloadSig);

      setState(prev => ({ ...prev, step: 'submitting-tx' }));
      const blockfrostKey = network === 'mainnet'
        ? process.env.NEXT_PUBLIC_BLOCKFROST_MAINNET_KEY
        : process.env.NEXT_PUBLIC_BLOCKFROST_PREPROD_KEY;

      if (!blockfrostKey) {
        throw new Error(`Blockfrost API key not configured for ${network}`);
      }

      const lucid = await Lucid.new(
        new Blockfrost(`https://cardano-${network}.blockfrost.io/api/v0`, blockfrostKey),
        network === 'mainnet' ? 'Mainnet' : 'Preprod'
      );
      lucid.selectWallet(wallet.api as any);

      const metadata = serializeDIDMetadata(didEvent);
      const tx = await lucid.newTx().attachMetadata(L_DID, metadata[L_DID]).complete();
      const signedTx = await tx.sign().complete();
      const txHash = await signedTx.submit();

      setState({ step: 'complete', did, ipfsCid, txHash });
      onComplete?.();

    } catch (err: unknown) {
      console.error('Create DID error:', err);
      let message = t('errors.unknown');
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      } else if (err && typeof err === 'object' && 'message' in err) {
        message = String((err as { message: unknown }).message);
      } else if (err) {
        message = String(err);
      }
      setState({ step: 'error', error: message });
    }
  };

  const handleReset = () => {
    setState({ step: 'idle' });
  };

  const progressSteps = stepOrder.map((s) => ({
    id: s,
    label: t(`steps.${s === 'getting-addresses' ? 'gettingAddresses' : s === 'deriving-did' ? 'derivingDID' : s === 'generating-doc' ? 'generatingDoc' : s === 'pinning-ipfs' ? 'pinningIPFS' : s === 'building-payload' ? 'buildingPayload' : s === 'submitting-tx' ? 'submittingTx' : 'signing'}`),
  }));

  if (state.step === 'error') {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-error/15 mb-3 animate-scale-in">
          <AlertCircle className="h-6 w-6 text-error" />
        </div>
        <h3 className="text-lg font-semibold text-error mb-2">{t('errorTitle')}</h3>
        <div role="alert" className="text-sm text-error bg-error/10 px-4 py-3 rounded-lg mb-4 max-w-md mx-auto">
          {state.error}
        </div>
        <Button onClick={handleReset}>{t('tryAgain')}</Button>
      </div>
    );
  }

  if (state.step === 'complete') {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success/15 mb-3 animate-scale-in">
          <CheckCircle className="h-6 w-6 text-success" />
        </div>
        <h3 className="text-lg font-semibold text-success mb-4">{t('successTitle')}</h3>

        <div className="text-left space-y-3 max-w-lg mx-auto mb-6">
          <Card className="p-3">
            <label className="block text-xs text-text-secondary uppercase mb-1">DID</label>
            <code className="text-sm break-all text-text-primary">{state.did}</code>
          </Card>

          <Card className="p-3">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-text-secondary uppercase">IPFS CID</label>
              <a
                href={`https://gateway.pinata.cloud/ipfs/${state.ipfsCid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-xs hover:underline inline-flex items-center gap-1"
              >
                {t('viewIPFS')} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <code className="text-sm break-all text-text-primary">{state.ipfsCid}</code>
          </Card>

          {state.txHash && (
            <Card className="p-3">
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

        <Button variant="secondary" onClick={handleReset}>{t('createAnother')}</Button>
      </div>
    );
  }

  const isProcessing = state.step !== 'idle';

  return (
    <div className="text-center py-4">
      <h3 className="text-xl font-semibold text-text-primary mb-2">{t('title')}</h3>
      <p className="text-text-secondary mb-6 max-w-md mx-auto">{t('description')}</p>

      {isProcessing ? (
        <div className="max-w-sm mx-auto">
          <ProgressSteps steps={progressSteps} currentStep={state.step} />
          {state.did && (
            <p className="mt-3 text-xs text-text-muted break-all">DID: {state.did}</p>
          )}
        </div>
      ) : (
        <Button size="lg" onClick={handleCreate}>{t('createButton')}</Button>
      )}
    </div>
  );
}
