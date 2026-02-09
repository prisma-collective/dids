'use client';

import { useState } from 'react';
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

export function RevokeDID({ wallet, network, currentDID, onComplete }: RevokeDIDProps) {
  const [did, setDid] = useState(currentDID || '');
  const [state, setState] = useState<RevokeDIDState>({ step: 'idle' });

  const handleRevoke = async () => {
    if (!did) {
      setState({ step: 'error', error: 'Please enter a DID' });
      return;
    }

    // Show confirmation first
    if (state.step === 'idle') {
      setState({ step: 'confirm' });
      return;
    }

    setState({ step: 'fetching-current' });

    try {
      // Step 1: Fetch current DID event
      const currentEvent = await fetchLatestDIDEvent(did, network);

      if (!currentEvent) {
        throw new Error('DID not found. Cannot revoke a DID that does not exist.');
      }

      if (currentEvent.event.action === 'revoke') {
        throw new Error('DID is already revoked.');
      }

      setState(prev => ({ ...prev, currentEvent }));

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

      // Step 3: Create revoked DID Document
      setState(prev => ({ ...prev, step: 'pinning-ipfs' }));

      const revokedDocument = {
        '@context': [
          'https://www.w3.org/ns/did/v1',
        ],
        id: did,
        status: 'revoked',
        revokedAt: new Date().toISOString(),
      };

      const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT;

      if (!pinataJwt) {
        throw new Error('Pinata JWT not configured. Set NEXT_PUBLIC_PINATA_JWT in .env.local');
      }

      const pinata = new PinataClient({
        jwt: pinataJwt,
      });

      const revokedCid = await pinata.pinJSON(revokedDocument);
      setState(prev => ({ ...prev, revokedCid }));

      // Step 4: Build and sign revoke payload
      setState(prev => ({ ...prev, step: 'building-payload' }));

      const revokePayload = buildRevokePayload({
        did,
        ipfsCid: revokedCid,
        prevTxHash: currentEvent.txHash,
        version: currentEvent.event.v + 1,
      });

      setState(prev => ({ ...prev, step: 'signing' }));

      const payloadSig = await signDIDPayload(
        wallet.api,
        revokePayload,
        baseAddressHex
      );

      const didEvent: DIDEvent = buildDIDEvent(revokePayload, payloadSig);
      console.log('Revoke DID Event created:', didEvent);

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
      console.log('Revoke transaction submitted:', txHash);

      // Step 7: Success!
      setState({
        step: 'complete',
        currentEvent,
        revokedCid,
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

  const handleCancel = () => {
    setState({ step: 'idle' });
  };

  const getStepMessage = (step: Step): string => {
    switch (step) {
      case 'fetching-current': return 'Fetching current DID state...';
      case 'pinning-ipfs': return 'Pinning revocation document to IPFS...';
      case 'building-payload': return 'Building revoke payload...';
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
      <div className="revoke-did">
        <div className="error-state">
          <h3>Error Revoking DID</h3>
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
      <div className="revoke-did">
        <div className="success-state warning">
          <h3>DID Revoked Successfully</h3>
          <div className="result-details">
            <div className="result-item">
              <label>DID:</label>
              <code>{did}</code>
            </div>
            <div className="result-item">
              <label>Final Version:</label>
              <code>{state.currentEvent ? state.currentEvent.event.v + 1 : 'N/A'}</code>
            </div>
            <div className="result-item">
              <label>Revocation CID:</label>
              <code>{state.revokedCid}</code>
              <a
                href={`https://gateway.pinata.cloud/ipfs/${state.revokedCid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                View on IPFS
              </a>
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
          <p className="warning-text">
            This DID can no longer be updated or used for authentication.
          </p>
          <button onClick={handleReset} className="btn btn-secondary">
            Done
          </button>
        </div>
      </div>
    );
  }

  if (state.step === 'confirm') {
    return (
      <div className="revoke-did">
        <div className="confirm-state">
          <h3>Confirm Revocation</h3>
          <p className="warning-text">
            Are you sure you want to revoke this DID?
          </p>
          <p className="description">
            <strong>DID:</strong> <code>{did}</code>
          </p>
          <p className="warning-text">
            This action is permanent. The DID will no longer be valid for authentication
            and cannot be updated after revocation.
          </p>
          <div className="button-group">
            <button onClick={handleCancel} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleRevoke} className="btn btn-danger">
              Yes, Revoke DID
            </button>
          </div>
        </div>
      </div>
    );
  }

  // At this point, we've already returned early for 'error', 'complete', and 'confirm' states
  // So state.step can only be 'idle', 'fetching-current', 'pinning-ipfs', 'building-payload', or 'signing'
  const isProcessing = state.step !== 'idle';

  return (
    <div className="revoke-did">
      <h3>Revoke DID</h3>
      <p className="description warning-text">
        Permanently revoke a DID. This cannot be undone.
      </p>

      <div className="form-group">
        <label htmlFor="did-input">DID to Revoke</label>
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

      {isProcessing && (
        <div className="processing">
          <div className="spinner" />
          <p>{getStepMessage(state.step)}</p>
        </div>
      )}

      {!isProcessing && (
        <button onClick={handleRevoke} className="btn btn-danger">
          Revoke DID
        </button>
      )}
    </div>
  );
}
