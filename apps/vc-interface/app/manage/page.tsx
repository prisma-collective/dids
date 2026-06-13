'use client';

import { useState, useEffect, useCallback } from 'react';
import { RevocationUI } from '@/components/RevocationUI';
import { useWallet } from '@/contexts/WalletContext';
import { config } from '@/config/resolve-config';
import {
  revokeCredential,
  fetchIssuerCredentials,
  fetchBatchCredentialStatuses,
  extractDisclosableClaims,
  fetchCredentialFromIPFS,
} from '@/services/vcService';
import { getCredential, storeCredential } from '@/services/credentialStore';
import type { VerifiableCredential, VCClaim, RevocationRequest } from '@/types/vc';
import { Button, EmptyState } from '@prisma-events/dids-ui';

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

      // Deduplicate by vcHash
      const unique = new Map<string, typeof credentials[0]>();
      for (const cred of credentials) {
        if (!unique.has(cred.vcHash)) unique.set(cred.vcHash, cred);
      }
      const dedupedCreds = Array.from(unique.values());

      // 1. Batch-fetch all statuses in one request
      const vcHashes = dedupedCreds.map(c => c.vcHash);
      const statusMap = await fetchBatchCredentialStatuses(vcHashes, config.INDEXER_ENDPOINT);

      // 2. Fetch IPFS credentials in parallel for those not in localStorage
      const ipfsResults = await Promise.all(
        dedupedCreds.map(async (cred) => {
          let stored = getCredential(cred.vcHash);
          if (!stored && cred.ipfsCid) {
            const ipfsData = await fetchCredentialFromIPFS(cred.ipfsCid);
            if (ipfsData?.credentialString) {
              stored = {
                credentialString: ipfsData.credentialString,
                jti: ipfsData.jti,
                vct: ipfsData.vct,
                issuerDid: ipfsData.issuerDid,
                holderDid: ipfsData.holderDid,
                issuedAt: ipfsData.issuedAt,
                txHash: cred.txHash,
                ipfsCid: cred.ipfsCid,
              };
              storeCredential(stored);
            }
          }
          return { cred, stored };
        })
      );

      // 3. Build enriched list
      const results: VerifiableCredential[] = ipfsResults.map(({ cred, stored }) => {
        let status = statusMap.get(cred.vcHash) ?? 'not_found';
        if (status === 'not_found' && cred.txHash) status = 'pending';

        let credentialString: string | undefined;
        let claims: VCClaim[] = [];
        if (stored) {
          credentialString = stored.credentialString;
          try {
            claims = extractDisclosableClaims(stored.credentialString).map(c => ({
              key: c.key,
              value: c.value as string | number | boolean,
              disclosable: true,
            }));
          } catch { /* credential string may not be parseable */ }
        }

        return {
          id: cred.vcHash,
          type: cred.vcType as VerifiableCredential['type'],
          issuerDid: did,
          holderDid: cred.holderDid,
          issuedAt: cred.timestamp,
          status,
          claims,
          txHash: cred.txHash,
          credentialString,
          ipfsCid: cred.ipfsCid ?? undefined,
        };
      });

      setIssuedCredentials(results);
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

    const result = await revokeCredential(
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

    return { txHash: result.txHash };
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
      network={config.NETWORK}
    />
  );
}
