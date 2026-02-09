'use client';

import { useState } from 'react';
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

// Helper to convert hex stake address to bech32 (client-side only)
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

export function CreateDID({ wallet, network, onComplete }: CreateDIDProps) {
  const [state, setState] = useState<CreateDIDState>({ step: 'idle' });

  const getExplorerUrl = (txHash: string) => {
    const base = network === 'mainnet'
      ? 'https://cardanoscan.io'
      : 'https://preprod.cardanoscan.io';
    return `${base}/transaction/${txHash}`;
  };

  const handleCreate = async () => {
    setState({ step: 'getting-addresses' });

    try {
      // Step 1: Get addresses from wallet
      const rewardAddresses = await wallet.api.getRewardAddresses();
      if (!rewardAddresses || rewardAddresses.length === 0) {
        throw new Error('No reward addresses found. Please ensure your wallet has a stake key.');
      }

      const usedAddresses = await wallet.api.getUsedAddresses();
      if (!usedAddresses || usedAddresses.length === 0) {
        throw new Error('No used addresses found. Please fund your wallet first.');
      }

      // Get addresses in hex format (CIP-30 returns hex)
      const baseAddressHex = usedAddresses[0];
      const stakeAddressHex = rewardAddresses[0];

      // Step 2: Derive DID from stake address
      setState({ step: 'deriving-did' });

      // Convert hex addresses to bech32 (client-side only using browser lib)
      const stakeAddressBech32 = await hexStakeAddressToBech32(stakeAddressHex);

      const did = deriveDID(stakeAddressBech32);
      setState(prev => ({ ...prev, did, step: 'building-payload' }));

      // Step 3: Create preliminary payload and sign to get public key
      const preliminaryPayload = buildCreatePayload({
        did,
        ipfsCid: 'pending',
      });

      setState(prev => ({ ...prev, step: 'signing' }));

      // Use SDK's signDIDPayload which handles hex encoding
      const preliminarySig = await signDIDPayload(
        wallet.api,
        preliminaryPayload,
        baseAddressHex
      );

      // Now we have the public key from the wallet
      const publicKeyHex = preliminarySig.key;

      // Step 4: Generate DID Document with real public key
      setState(prev => ({ ...prev, step: 'generating-doc' }));

      const didDocument = generateDIDDocument({
        did,
        publicKeyHex,
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
      setState(prev => ({ ...prev, ipfsCid }));

      // Step 6: Build final payload with real CID and sign
      setState(prev => ({ ...prev, step: 'building-payload' }));

      const createPayload = buildCreatePayload({
        did,
        ipfsCid,
      });

      setState(prev => ({ ...prev, step: 'signing' }));

      const payloadSig = await signDIDPayload(
        wallet.api,
        createPayload,
        baseAddressHex
      );

      // Build the final DID event
      const didEvent: DIDEvent = buildDIDEvent(createPayload, payloadSig);
      console.log('DID Event created:', didEvent);

      // Submit transaction to blockchain (indexer will verify on read)
      setState(prev => ({ ...prev, step: 'submitting-tx' }));

      const blockfrostKey = network === 'mainnet'
        ? process.env.NEXT_PUBLIC_BLOCKFROST_MAINNET_KEY
        : process.env.NEXT_PUBLIC_BLOCKFROST_PREPROD_KEY;

      console.log('Blockfrost key available:', !!blockfrostKey, 'Network:', network);

      if (!blockfrostKey) {
        throw new Error(`Blockfrost API key not configured for ${network}`);
      }

      // Initialize Lucid with Blockfrost
      console.log('Initializing Lucid...');
      const lucid = await Lucid.new(
        new Blockfrost(
          `https://cardano-${network}.blockfrost.io/api/v0`,
          blockfrostKey
        ),
        network === 'mainnet' ? 'Mainnet' : 'Preprod'
      );
      console.log('Lucid initialized');

      // Connect wallet to Lucid (CIP-30 wallet API is compatible)
      console.log('Selecting wallet...');
      lucid.selectWallet(wallet.api as any);
      console.log('Wallet selected');

      // Build transaction with DID metadata (chunked for Cardano's 64-byte string limit)
      console.log('Serializing metadata with chunking...');
      const metadata = serializeDIDMetadata(didEvent);
      console.log('Building transaction with metadata label:', L_DID);
      const tx = await lucid
        .newTx()
        .attachMetadata(L_DID, metadata[L_DID])
        .complete();
      console.log('Transaction built');

      // Sign with wallet
      console.log('Signing transaction...');
      const signedTx = await tx.sign().complete();
      console.log('Transaction signed');

      // Submit to blockchain
      console.log('Submitting transaction...');
      const txHash = await signedTx.submit();
      console.log('Transaction submitted:', txHash);

      // Step 9: Success!
      setState({
        step: 'complete',
        did,
        ipfsCid,
        txHash,
      });

      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      }

    } catch (err: unknown) {
      console.error('Create DID error:', err);
      let message = 'An unknown error occurred';
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

  const getStepMessage = (step: Step): string => {
    switch (step) {
      case 'getting-addresses': return 'Getting wallet addresses...';
      case 'deriving-did': return 'Deriving DID from stake address...';
      case 'generating-doc': return 'Generating DID Document...';
      case 'pinning-ipfs': return 'Pinning to IPFS...';
      case 'building-payload': return 'Building payload...';
      case 'signing': return 'Please sign in your wallet...';
      case 'submitting-tx': return 'Submitting transaction to blockchain...';
      default: return '';
    }
  };

  if (state.step === 'error') {
    return (
      <div className="create-did">
        <div className="error-state">
          <h3>Error Creating DID</h3>
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
      <div className="create-did">
        <div className="success-state">
          <h3>DID Created Successfully!</h3>
          <div className="result-details">
            <div className="result-item">
              <label>DID:</label>
              <code>{state.did}</code>
            </div>
            <div className="result-item">
              <label>IPFS CID:</label>
              <code>{state.ipfsCid}</code>
              <a
                href={`https://gateway.pinata.cloud/ipfs/${state.ipfsCid}`}
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
          <button onClick={handleReset} className="btn btn-secondary">
            Create Another DID
          </button>
        </div>
      </div>
    );
  }

  const isProcessing = state.step !== 'idle';

  return (
    <div className="create-did">
      <h3>Create DID</h3>
      <p className="description">
        Create a W3C-compliant Decentralized Identifier anchored to your Cardano stake address.
      </p>

      {isProcessing && (
        <div className="processing">
          <div className="spinner" />
          <p>{getStepMessage(state.step)}</p>
          {state.did && (
            <div className="progress-detail">
              <small>DID: {state.did}</small>
            </div>
          )}
        </div>
      )}

      {!isProcessing && (
        <button onClick={handleCreate} className="btn btn-primary btn-large">
          Create DID
        </button>
      )}
    </div>
  );
}
