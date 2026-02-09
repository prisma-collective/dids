'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ConnectedWallet } from '../contexts/WalletContext';
import type { Network } from './NetworkSelector';
import { fetchLatestDIDEvent, DIDEventRecord } from '../services/didService';
import { CreateDID } from './CreateDID';
import { UpdateDID } from './UpdateDID';
import { RevokeDID } from './RevokeDID';
import { deriveDID, hexToBytes } from '@prisma-dids/sdk/browser';

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

type Tab = 'status' | 'create' | 'update' | 'revoke';

interface DIDStatus {
  loading: boolean;
  did: string | null;
  currentEvent: DIDEventRecord | null;
  error: string | null;
}

export function DIDManager({ wallet, network }: DIDManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('status');
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
      // Get stake address from wallet
      console.log('[DIDManager] Getting reward addresses...');
      const rewardAddresses = await wallet.api.getRewardAddresses();
      console.log('[DIDManager] Reward addresses:', rewardAddresses);

      if (!rewardAddresses || rewardAddresses.length === 0) {
        setStatus({
          loading: false,
          did: null,
          currentEvent: null,
          error: 'No stake address found in wallet.',
        });
        return;
      }

      const stakeAddressHex = rewardAddresses[0];
      console.log('[DIDManager] Converting hex to bech32:', stakeAddressHex);
      const stakeAddressBech32 = await hexStakeAddressToBech32(stakeAddressHex);
      console.log('[DIDManager] Bech32 stake address:', stakeAddressBech32);

      const did = deriveDID(stakeAddressBech32);
      console.log('[DIDManager] Derived DID:', did);

      // Check if DID exists on-chain
      console.log('[DIDManager] Fetching latest DID event from API...');
      const currentEvent = await fetchLatestDIDEvent(did, network);
      console.log('[DIDManager] Current event:', currentEvent);

      setStatus({
        loading: false,
        did,
        currentEvent,
        error: null,
      });

      // Auto-select appropriate tab
      if (!currentEvent) {
        setActiveTab('create');
      } else if (currentEvent.event.action === 'revoke') {
        setActiveTab('status');
      } else {
        setActiveTab('status');
      }

    } catch (err) {
      console.error('[DIDManager] Error:', err);
      setStatus({
        loading: false,
        did: null,
        currentEvent: null,
        error: err instanceof Error ? err.message : 'Failed to check DID status',
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
    return (
      <div className="did-manager">
        <div className="loading-state">
          <div className="spinner" />
          <p>Checking DID status...</p>
        </div>
      </div>
    );
  }

  if (status.error) {
    return (
      <div className="did-manager">
        <div className="error-state">
          <h3>Error</h3>
          <p className="error-message">{status.error}</p>
          <button onClick={checkDIDStatus} className="btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isRevoked = status.currentEvent?.event.action === 'revoke';
  const hasExistingDID = status.currentEvent !== null;

  return (
    <div className="did-manager">
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          Status
        </button>
        {!hasExistingDID && (
          <button
            className={`tab ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            Create
          </button>
        )}
        {hasExistingDID && !isRevoked && (
          <>
            <button
              className={`tab ${activeTab === 'update' ? 'active' : ''}`}
              onClick={() => setActiveTab('update')}
            >
              Update
            </button>
            <button
              className={`tab ${activeTab === 'revoke' ? 'active' : ''}`}
              onClick={() => setActiveTab('revoke')}
            >
              Revoke
            </button>
          </>
        )}
      </div>

      <div className="tab-content">
        {activeTab === 'status' && (
          <div className="did-status">
            <h3>Your DID Status</h3>

            <div className="status-details">
              <div className="status-item">
                <label>DID:</label>
                <code className="did-value">{status.did}</code>
              </div>

              {hasExistingDID ? (
                <>
                  <div className="status-item">
                    <label>Status:</label>
                    <span className={`status-badge ${isRevoked ? 'revoked' : 'active'}`}>
                      {isRevoked ? 'Revoked' : 'Active'}
                    </span>
                  </div>
                  <div className="status-item">
                    <label>Version:</label>
                    <code>{status.currentEvent!.event.v}</code>
                  </div>
                  <div className="status-item">
                    <label>Last Action:</label>
                    <code>{status.currentEvent!.event.action}</code>
                  </div>
                  <div className="status-item">
                    <label>IPFS CID:</label>
                    <code>{status.currentEvent!.event.ipfs}</code>
                    <a
                      href={`https://gateway.pinata.cloud/ipfs/${status.currentEvent!.event.ipfs}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link"
                    >
                      View
                    </a>
                  </div>
                  <div className="status-item">
                    <label>Last Tx:</label>
                    <a
                      href={getExplorerUrl(status.currentEvent!.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link"
                    >
                      {status.currentEvent!.txHash.substring(0, 20)}...
                    </a>
                  </div>
                </>
              ) : (
                <div className="no-did-message">
                  <p>No DID found for this wallet.</p>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="btn btn-primary"
                  >
                    Create Your DID
                  </button>
                </div>
              )}
            </div>

            {hasExistingDID && !isRevoked && (
              <div className="status-actions">
                <button
                  onClick={() => setActiveTab('update')}
                  className="btn btn-secondary"
                >
                  Update DID
                </button>
                <button
                  onClick={() => setActiveTab('revoke')}
                  className="btn btn-danger-outline"
                >
                  Revoke DID
                </button>
              </div>
            )}

            {isRevoked && (
              <div className="revoked-message">
                <p>This DID has been revoked and can no longer be used.</p>
              </div>
            )}

            <button onClick={checkDIDStatus} className="btn btn-link refresh-btn">
              Refresh Status
            </button>
          </div>
        )}

        {activeTab === 'create' && (
          <CreateDID
            wallet={wallet}
            network={network}
            onComplete={handleOperationComplete}
          />
        )}

        {activeTab === 'update' && status.did && (
          <UpdateDID
            wallet={wallet}
            network={network}
            currentDID={status.did}
            onComplete={handleOperationComplete}
          />
        )}

        {activeTab === 'revoke' && status.did && (
          <RevokeDID
            wallet={wallet}
            network={network}
            currentDID={status.did}
            onComplete={handleOperationComplete}
          />
        )}
      </div>
    </div>
  );
}
