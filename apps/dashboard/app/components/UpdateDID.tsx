'use client';

import { useState } from 'react';
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
  | 'building-payload'
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

export function UpdateDID({ wallet, network, currentDID, onComplete }: UpdateDIDProps) {
  const [did, setDid] = useState(currentDID || '');
  const [state, setState] = useState<UpdateDIDState>({ step: 'idle' });
  const [serviceEndpoint, setServiceEndpoint] = useState('');

  const handleUpdate = async () => {
    if (!did) {
      setState({ step: 'error', error: 'Please enter a DID' });
      return;
    }

    setState({ step: 'fetching-current' });

    try {
      // Step 1: Fetch current DID event
      const currentEvent = await fetchLatestDIDEvent(did, network);

      if (!currentEvent) {
        throw new Error('DID not found. Cannot update a DID that does not exist.');
      }

      if (currentEvent.event.action === 'revoke') {
        throw new Error('Cannot update a revoked DID.');
      }

      setState(prev => ({ ...prev, currentEvent, step: 'generating-doc' }));

      // Step 2: Get addresses from wallet
      const rewardAddresses = await wallet.api.getRewardAddresses();
      if (!rewardAddresses || rewardAddresses.length === 0) {
        throw new Error('No reward addresses found.');
      }

      const usedAddresses = await wallet.api.getUsedAddresses();
      if (!usedAddresses || usedAddresses.length === 0) {
        throw new Error('No used addresses found.');
      }

      const baseAddressHex = usedAddresses[0];
      const stakeAddressHex = rewardAddresses[0];

      // Verify the stake address matches the DID
      const stakeAddressBech32 = await hexStakeAddressToBech32(stakeAddressHex);
      const expectedDID = `did:cardano:${stakeAddressBech32}`;

      if (did !== expectedDID) {
        throw new Error(`Wallet stake address does not match DID. Expected wallet with stake address from ${did}`);
      }

      // Step 3: Get public key by signing preliminary payload
      setState(prev => ({ ...prev, step: 'signing' }));

      const preliminaryPayload = buildUpdatePayload({
        did,
        ipfsCid: 'pending',
        prevTxHash: currentEvent.txHash,
        version: currentEvent.event.v + 1,
      });

      const preliminarySig = await signDIDPayload(
        wallet.api,
        preliminaryPayload,
        baseAddressHex
      );

      const publicKeyHex = preliminarySig.key;

      // Step 4: Generate updated DID Document
      setState(prev => ({ ...prev, step: 'generating-doc' }));

      const didDocument = generateDIDDocument({
        did,
        publicKeyHex,
        serviceEndpoint: serviceEndpoint || undefined,
      });

      // Step 5: Pin to IPFS
      setState(prev => ({ ...prev, step: 'pinning-ipfs' }));

      const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT;

      if (!pinataJwt) {
        throw new Error('Pinata JWT not configured. Set NEXT_PUBLIC_PINATA_JWT in .env.local');
      }

      const pinata = new PinataClient({
        jwt: pinataJwt,
      });

      const ipfsCid = await pinata.pinJSON(didDocument);
      setState(prev => ({ ...prev, newIpfsCid: ipfsCid }));

      // Step 6: Build and sign final payload
      setState(prev => ({ ...prev, step: 'building-payload' }));

      const updatePayload = buildUpdatePayload({
        did,
        ipfsCid,
        prevTxHash: currentEvent.txHash,
        version: currentEvent.event.v + 1,
      });

      setState(prev => ({ ...prev, step: 'signing' }));

      const payloadSig = await signDIDPayload(
        wallet.api,
        updatePayload,
        baseAddressHex
      );

      const didEvent: DIDEvent = buildDIDEvent(updatePayload, payloadSig);
      console.log('Update DID Event created:', didEvent);

      // Submit transaction to blockchain (indexer will verify on read)
      setState(prev => ({ ...prev, step: 'submitting-tx' }));

      const blockfrostKey = network === 'mainnet'
        ? process.env.NEXT_PUBLIC_BLOCKFROST_MAINNET_KEY
        : process.env.NEXT_PUBLIC_BLOCKFROST_PREPROD_KEY;

      if (!blockfrostKey) {
        throw new Error(`Blockfrost API key not configured for ${network}`);
      }

      // Initialize Lucid with Blockfrost
      const lucid = await Lucid.new(
        new Blockfrost(
          `https://cardano-${network}.blockfrost.io/api/v0`,
          blockfrostKey
        ),
        network === 'mainnet' ? 'Mainnet' : 'Preprod'
      );

      // Connect wallet to Lucid (CIP-30 wallet API is compatible)
      lucid.selectWallet(wallet.api as any);

      // Build transaction with DID metadata (chunked for Cardano's 64-byte string limit)
      const metadata = serializeDIDMetadata(didEvent);
      const tx = await lucid
        .newTx()
        .attachMetadata(L_DID, metadata[L_DID])
        .complete();

      // Sign with wallet
      const signedTx = await tx.sign().complete();

      // Submit to blockchain
      const txHash = await signedTx.submit();
      console.log('Update transaction submitted:', txHash);

      // Step 9: Success!
      setState({
        step: 'complete',
        currentEvent,
        newIpfsCid: ipfsCid,
        txHash,
      });

      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setState({ step: 'error', error: message });
    }
  };

  const handleReset = () => {
    setState({ step: 'idle' });
    onComplete?.();
  };

  const getStepMessage = (step: Step): string => {
    switch (step) {
      case 'fetching-current': return 'Fetching current DID state...';
      case 'generating-doc': return 'Generating updated DID Document...';
      case 'pinning-ipfs': return 'Pinning to IPFS...';
      case 'building-payload': return 'Building update payload...';
      case 'signing': return 'Please sign in your wallet...';
      case 'submitting-tx': return 'Submitting transaction to blockchain...';
      default: return '';
    }
  };

  const getExplorerUrl = (txHash: string) => {
    const base = network === 'mainnet'
      ? 'https://cardanoscan.io'
      : 'https://preprod.cardanoscan.io';
    return `${base}/transaction/${txHash}`;
  };

  if (state.step === 'error') {
    return (
      <div className="update-did">
        <div className="error-state">
          <h3>Error Updating DID</h3>
          <p className="error-message">{state.error}</p>
          <button onClick={handleReset} className="btn btn-primary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (state.step === 'complete') {
    return (
      <div className="update-did">
        <div className="success-state">
          <h3>DID Updated Successfully!</h3>
          <div className="result-details">
            <div className="result-item">
              <label>DID:</label>
              <code>{did}</code>
            </div>
            <div className="result-item">
              <label>New Version:</label>
              <code>{state.currentEvent ? state.currentEvent.event.v + 1 : 'N/A'}</code>
            </div>
            <div className="result-item">
              <label>New IPFS CID:</label>
              <code>{state.newIpfsCid}</code>
              <a
                href={`https://gateway.pinata.cloud/ipfs/${state.newIpfsCid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                View on IPFS
              </a>
            </div>
            <div className="result-item">
              <label>Previous Tx:</label>
              <code>{state.currentEvent?.txHash?.substring(0, 20)}...</code>
            </div>
            {state.txHash && (
              <div className="result-item">
                <label>Transaction:</label>
                <code className="tx-hash">{state.txHash}</code>
                <a
                  href={getExplorerUrl(state.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  View on Explorer
                </a>
              </div>
            )}
          </div>
          <button onClick={handleReset} className="btn btn-secondary">
            Done
          </button>
        </div>
      </div>
    );
  }

  const isProcessing = state.step !== 'idle';

  return (
    <div className="update-did">
      <h3>Update DID</h3>
      <p className="description">
        Update your DID Document with new information or service endpoints.
      </p>

      <div className="form-group">
        <label htmlFor="did-input">DID to Update</label>
        <input
          id="did-input"
          type="text"
          value={did}
          onChange={(e) => setDid(e.target.value)}
          placeholder="did:cardano:stake_test1..."
          disabled={isProcessing}
          className="input"
        />
      </div>

      <div className="form-group">
        <label htmlFor="service-endpoint">Service Endpoint (optional)</label>
        <input
          id="service-endpoint"
          type="text"
          value={serviceEndpoint}
          onChange={(e) => setServiceEndpoint(e.target.value)}
          placeholder="https://api.example.com"
          disabled={isProcessing}
          className="input"
        />
      </div>

      {isProcessing && (
        <div className="processing">
          <div className="spinner" />
          <p>{getStepMessage(state.step)}</p>
        </div>
      )}

      {!isProcessing && (
        <button onClick={handleUpdate} className="btn btn-primary">
          Update DID
        </button>
      )}
    </div>
  );
}
