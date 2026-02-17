'use client';

import { useState, useEffect, useCallback } from 'react';
import { CredentialInbox } from '@/components/CredentialInbox';
import { SelectiveDisclosure } from '@/components/SelectiveDisclosure';
import { CredentialDetailModal } from '@/components/shared/CredentialDetailModal';
import { useWallet } from '@/contexts/WalletContext';
import { config } from '@/config/resolve-config';
import {
  createSelectivePresentation,
  extractDisclosableClaims,
  fetchCredentialStatus,
  fetchHolderCredentials,
  fetchCredentialFromIPFS,
} from '@/services/vcService';
import { getCredentialsForHolder, getCredentialsForIssuer, storeCredential, toVerifiableCredential } from '@/services/credentialStore';
import type { StoredCredential } from '@/services/credentialStore';
import type { VerifiableCredential, VCClaim, PresentationData } from '@/types/vc';

type ViewMode = 'inbox' | 'share' | 'detail';

export default function CredentialsPage() {
  const { wallet, did, connecting, connect, availableWallets } = useWallet();
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
      for (const ic of indexerCreds) {
        if (localByJti.has(ic.vcHash)) continue; // Already have it locally
        if (!ic.ipfsCid) continue; // No IPFS CID → can't retrieve credential

        // Fetch from IPFS and cache locally
        const ipfsData = await fetchCredentialFromIPFS(ic.ipfsCid);
        if (ipfsData?.credentialString) {
          const stored: StoredCredential = {
            credentialString: ipfsData.credentialString,
            jti: ipfsData.jti,
            vct: ipfsData.vct,
            issuerDid: ipfsData.issuerDid,
            holderDid: ipfsData.holderDid,
            issuedAt: ipfsData.issuedAt,
            txHash: ic.txHash,
            ipfsCid: ic.ipfsCid,
          };
          storeCredential(stored); // Cache in localStorage for next time
          localByJti.set(stored.jti, stored);
        }
      }

      // 3. Enrich all credentials with claims + status
      const enriched = await Promise.all(
        Array.from(localByJti.values()).map(async (cred) => {
          let claims: VCClaim[] = [];
          try {
            const disclosable = extractDisclosableClaims(cred.credentialString);
            claims = disclosable.map(c => ({
              key: c.key,
              value: c.value as string | number | boolean,
              disclosable: true,
            }));
          } catch { /* credential string may not be parseable */ }

          let status = await fetchCredentialStatus(cred.jti, config.INDEXER_ENDPOINT);
          // Anchored but not yet indexed → show as pending, not "not found"
          if (status === 'not_found' && cred.txHash) status = 'pending';
          return toVerifiableCredential(cred, claims, status);
        })
      );

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
        onViewCredential={handleViewDetail}
        holderDid={did ?? undefined}
        isLoading={isLoading}
        isWalletConnected={!!wallet}
        onConnectWallet={
          availableWallets.length > 0
            ? () => connect(availableWallets[0]!.name)
            : undefined
        }
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
