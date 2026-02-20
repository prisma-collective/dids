'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CredentialInbox } from '@/components/CredentialInbox';
import { SelectiveDisclosure } from '@/components/SelectiveDisclosure';
import { CredentialDetailModal } from '@/components/shared/CredentialDetailModal';
import { useWallet } from '@/contexts/WalletContext';
import { config } from '@/config/resolve-config';
import {
  createSelectivePresentation,
  extractDisclosableClaims,
  fetchBatchCredentialStatuses,
  fetchHolderCredentials,
  fetchCredentialFromIPFS,
} from '@/services/vcService';
import { getCredentialsForHolder, getCredentialsForIssuer, storeCredential, toVerifiableCredential } from '@/services/credentialStore';
import type { StoredCredential } from '@/services/credentialStore';
import type { VerifiableCredential, VCClaim, PresentationData } from '@/types/vc';

type ViewMode = 'inbox' | 'share' | 'detail';

export default function CredentialsPage() {
  const router = useRouter();
  const { wallet, did, connecting, connect, disconnect, availableWallets } = useWallet();
  const [viewMode, setViewMode] = useState<ViewMode>('inbox');
  const [selectedCredential, setSelectedCredential] = useState<VerifiableCredential | null>(null);
  const [credentials, setCredentials] = useState<VerifiableCredential[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load credentials from localStorage + indexer + IPFS fallback
  const loadCredentials = useCallback(async () => {
    if (!did) return;
    setIsLoading(true);
    try {
      // 1. Local credentials (localStorage)
      const held = getCredentialsForHolder(did);
      const issued = getCredentialsForIssuer(did);
      const localByJti = new Map<string, StoredCredential>();
      for (const c of [...held, ...issued]) {
        if (!localByJti.has(c.jti)) localByJti.set(c.jti, c);
      }

      // 2. Query indexer for held credentials (catches ones not in localStorage)
      const indexerCreds = await fetchHolderCredentials(did, config.INDEXER_ENDPOINT);
      const resolvedFromIndexer = new Set<string>();

      // 3. Fetch missing IPFS credentials in parallel (not sequentially)
      const ipfsFetches = indexerCreds
        .filter(ic => !localByJti.has(ic.vcHash) && ic.ipfsCid)
        .map(async (ic) => {
          const ipfsData = await fetchCredentialFromIPFS(ic.ipfsCid!);
          if (ipfsData?.credentialString) {
            const stored: StoredCredential = {
              credentialString: ipfsData.credentialString,
              jti: ipfsData.jti,
              vct: ipfsData.vct,
              issuerDid: ipfsData.issuerDid,
              holderDid: ipfsData.holderDid,
              issuedAt: ipfsData.issuedAt,
              txHash: ic.txHash,
              ipfsCid: ic.ipfsCid ?? undefined,
            };
            storeCredential(stored);
            localByJti.set(stored.jti, stored);
            resolvedFromIndexer.add(ic.vcHash);
          }
        });
      await Promise.all(ipfsFetches);

      // Mark indexer creds that were already in localStorage
      for (const ic of indexerCreds) {
        if (localByJti.has(ic.vcHash)) resolvedFromIndexer.add(ic.vcHash);
      }

      // 4. Batch-fetch all statuses in one request
      const allHashes = [
        ...Array.from(localByJti.values()).map(c => c.jti),
        ...indexerCreds.filter(ic => !resolvedFromIndexer.has(ic.vcHash) && !localByJti.has(ic.vcHash)).map(ic => ic.vcHash),
      ];
      const statusMap = await fetchBatchCredentialStatuses(allHashes, config.INDEXER_ENDPOINT);

      // 5. Enrich local credentials with claims + status
      const enriched: VerifiableCredential[] = Array.from(localByJti.values()).map((cred) => {
        let claims: VCClaim[] = [];
        try {
          const disclosable = extractDisclosableClaims(cred.credentialString);
          claims = disclosable.map(c => ({
            key: c.key,
            value: c.value as string | number | boolean,
            disclosable: true,
          }));
        } catch { /* credential string may not be parseable */ }

        let status = statusMap.get(cred.jti) ?? 'not_found';
        if (status === 'not_found' && cred.txHash) status = 'pending';
        return toVerifiableCredential(cred, claims, status);
      });

      // 6. Add indexer-only credentials (no IPFS, not in localStorage)
      for (const ic of indexerCreds) {
        if (resolvedFromIndexer.has(ic.vcHash) || localByJti.has(ic.vcHash)) continue;

        let status = statusMap.get(ic.vcHash) ?? 'not_found';
        if (status === 'not_found' && ic.txHash) status = 'pending';

        enriched.push({
          id: ic.vcHash,
          type: ic.vcType as VerifiableCredential['type'],
          issuerDid: ic.issuerDid,
          holderDid: did,
          issuedAt: ic.timestamp,
          status,
          claims: [],
          txHash: ic.txHash,
        });
      }

      setCredentials(enriched);
    } finally {
      setIsLoading(false);
    }
  }, [did]);

  useEffect(() => {
    if (did) loadCredentials();
  }, [did, loadCredentials]);

  const handleShare = (credential: VerifiableCredential) => {
    setSelectedCredential(credential);
    setViewMode('share');
  };

  const handleViewDetail = (credential: VerifiableCredential) => {
    setSelectedCredential(credential);
    setViewMode('detail');
  };

  const handleShareSubmit = async (data: PresentationData): Promise<string> => {
    if (!selectedCredential?.credentialString) {
      throw new Error('No credential string available');
    }
    const { presentation } = createSelectivePresentation(
      selectedCredential.credentialString,
      data.selectedClaims
    );
    // Encode presentation as a shareable URL
    const encoded = encodeURIComponent(presentation);
    return `${window.location.origin}/verify?p=${encoded}`;
  };

  const handleVerify = (credential: VerifiableCredential) => {
    if (!credential.credentialString) return;
    // Create a full presentation (all claims disclosed) and navigate to /verify
    const allClaimKeys = credential.claims.map(c => c.key);
    const { presentation } = createSelectivePresentation(
      credential.credentialString,
      allClaimKeys
    );
    const encoded = encodeURIComponent(presentation);
    router.push(`/verify?p=${encoded}`);
  };

  const handleBackToInbox = () => {
    setSelectedCredential(null);
    setViewMode('inbox');
  };

  // Selective Disclosure view
  if (viewMode === 'share' && selectedCredential) {
    return (
      <SelectiveDisclosure
        config={config}
        credential={selectedCredential}
        onShare={handleShareSubmit}
        onBack={handleBackToInbox}
        onCancel={handleBackToInbox}
      />
    );
  }

  // Main inbox view
  return (
    <>
      <CredentialInbox
        credentials={credentials}
        onShareCredential={handleShare}
        onVerifyCredential={handleVerify}
        onViewCredential={handleViewDetail}
        holderDid={did ?? undefined}
        isLoading={isLoading}
        isWalletConnected={!!wallet}
        availableWallets={availableWallets}
        onConnectSpecificWallet={connect}
        isConnecting={connecting}
        onDisconnect={disconnect}
      />

      {viewMode === 'detail' && selectedCredential && (
        <CredentialDetailModal
          credential={selectedCredential}
          onClose={handleBackToInbox}
          onShare={() => setViewMode('share')}
          network={config.NETWORK}
        />
      )}
    </>
  );
}
