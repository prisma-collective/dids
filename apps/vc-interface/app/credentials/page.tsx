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
} from '@/services/vcService';
import { getCredentialsForHolder, toVerifiableCredential } from '@/services/credentialStore';
import type { VerifiableCredential, VCClaim, PresentationData } from '@/types/vc';

type ViewMode = 'inbox' | 'share' | 'detail';

export default function CredentialsPage() {
  const { wallet, did, connecting, connect, availableWallets } = useWallet();
  const [viewMode, setViewMode] = useState<ViewMode>('inbox');
  const [selectedCredential, setSelectedCredential] = useState<VerifiableCredential | null>(null);
  const [credentials, setCredentials] = useState<VerifiableCredential[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load credentials from localStorage + enrich with indexer status
  const loadCredentials = useCallback(async () => {
    if (!did) return;
    setIsLoading(true);
    try {
      const stored = getCredentialsForHolder(did);

      const enriched = await Promise.all(
        stored.map(async (cred) => {
          // Extract claims from the credential string
          let claims: VCClaim[] = [];
          try {
            const disclosable = extractDisclosableClaims(cred.credentialString);
            claims = disclosable.map(c => ({
              key: c.key,
              value: c.value as string | number | boolean,
              disclosable: true,
            }));
          } catch {
            // If credential string can't be parsed, show empty claims
          }

          // Query indexer for status
          const status = await fetchCredentialStatus(cred.jti, config.INDEXER_ENDPOINT);

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
