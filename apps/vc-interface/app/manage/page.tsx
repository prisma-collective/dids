'use client';

import { useState, useEffect, useCallback } from 'react';
import { RevocationUI } from '@/components/RevocationUI';
import { useWallet } from '@/contexts/WalletContext';
import { config } from '@/config/resolve-config';
import {
  revokeCredential,
  fetchIssuerCredentials,
  fetchCredentialStatus,
} from '@/services/vcService';
import type { VerifiableCredential, RevocationRequest } from '@/types/vc';
import { Button, EmptyState } from '@prisma-dids/ui';

export default function ManagePage() {
  const { wallet, signingAddress, did, connecting, connect, availableWallets } = useWallet();
  const [issuedCredentials, setIssuedCredentials] = useState<VerifiableCredential[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const blockfrostKey = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY;

  // Fetch issued credentials from indexer + status enrichment
  const loadCredentials = useCallback(async () => {
    if (!did) return;
    setIsLoading(true);
    try {
      // Indexer /issuer/:did/credentials already filters to issue events
      const credentials = await fetchIssuerCredentials(did, config.INDEXER_ENDPOINT);

      // Deduplicate by vcHash + enrich with current status
      const byHash = new Map<string, VerifiableCredential>();
      for (const cred of credentials) {
        if (byHash.has(cred.vcHash)) continue;

        const status = await fetchCredentialStatus(cred.vcHash, config.INDEXER_ENDPOINT);
        byHash.set(cred.vcHash, {
          id: cred.vcHash,
          type: cred.vcType as VerifiableCredential['type'],
          issuerDid: did, // issuer is the current user
          holderDid: cred.holderDid,
          issuedAt: cred.timestamp,
          status,
          claims: [], // Claims not available from indexer (on-chain = metadata only)
          txHash: cred.txHash,
        });
      }

      setIssuedCredentials(Array.from(byHash.values()));
    } finally {
      setIsLoading(false);
    }
  }, [did]);

  useEffect(() => {
    if (did) loadCredentials();
  }, [did, loadCredentials]);

  const handleRevoke = async (request: RevocationRequest) => {
    if (!wallet || !signingAddress || !did) {
      throw new Error('Wallet not connected');
    }
    if (!blockfrostKey) {
      throw new Error('NEXT_PUBLIC_BLOCKFROST_API_KEY not configured');
    }

    // Find credential to get holderDid and vcType
    const cred = issuedCredentials.find(c => c.id === request.credentialId);
    if (!cred) throw new Error('Credential not found');

    const reason = request.reason === 'other' ? request.customReason : request.reason;

    await revokeCredential(
      wallet,
      signingAddress,
      {
        issuerDid: did,
        holderDid: cred.holderDid,
        vcHash: cred.id,
        vcType: cred.type,
        reason: reason || undefined,
      },
      { network: config.NETWORK, blockfrostApiKey: blockfrostKey }
    );

    // Refresh credentials list after revocation
    await loadCredentials();
  };

  // Wallet not connected
  if (!wallet || !did) {
    return (
      <div className="max-w-[600px] mx-auto p-4">
        <EmptyState
          title="Connect Wallet"
          description="Connect your Cardano wallet to manage issued credentials."
          action={
            availableWallets.length > 0 ? (
              <div className="flex gap-2 flex-wrap justify-center">
                {availableWallets.map(w => (
                  <Button
                    key={w.name}
                    onClick={() => connect(w.name)}
                    loading={connecting}
                  >
                    {w.name}
                  </Button>
                ))}
              </div>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <RevocationUI
      config={config}
      issuedCredentials={issuedCredentials}
      onRevoke={handleRevoke}
      issuerDid={did}
      isLoading={isLoading}
    />
  );
}
