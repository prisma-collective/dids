'use client';

import { useState } from 'react';
import { CredentialInbox } from '@/components/CredentialInbox';
import { SelectiveDisclosure } from '@/components/SelectiveDisclosure';
import { CredentialDetailModal } from '@/components/shared/CredentialDetailModal';
import { defaultConfig } from '@/config/org-config';
import type { VerifiableCredential } from '@/types/vc';

// Mock data for UI demonstration
// In production, this would be fetched from the VC Indexer based on holder's DID
const mockCredentials: VerifiableCredential[] = [
  {
    id: 'vc-jti-abc123def456',
    type: 'ContributionCredential',
    issuerDid: 'did:cardano:stake1ux7l5d9y4q3z8k2j0n5m4p6w9v8c3b1a0t2s7r6e5d4f3g2h1',
    holderDid: 'did:cardano:stake1uq9l3d7y2q1z6k0j8n3m2p4w7v6c1b9a8t0s5r4e3d2f1g0h9',
    issuedAt: '2024-12-01T10:00:00Z',
    status: 'active',
    txHash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
    ipfsCid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
    claims: [
      { key: 'projectId', value: 'catalyst-fund-14', disclosable: false },
      { key: 'contributionType', value: 'code', disclosable: true },
      { key: 'hours', value: 42, disclosable: true },
      { key: 'organization', value: 'Your Organization', disclosable: true },
      { key: 'description', value: 'Smart contract development for DID registry', disclosable: true },
    ],
  },
  {
    id: 'vc-jti-xyz789ghi012',
    type: 'ContributionCredential',
    issuerDid: 'did:cardano:stake1ux7l5d9y4q3z8k2j0n5m4p6w9v8c3b1a0t2s7r6e5d4f3g2h1',
    holderDid: 'did:cardano:stake1uq9l3d7y2q1z6k0j8n3m2p4w7v6c1b9a8t0s5r4e3d2f1g0h9',
    issuedAt: '2024-11-15T14:30:00Z',
    status: 'revoked',
    txHash: 'f6e5d4c3b2a10987654321098765432109876543210fedcba0987654321fedcba',
    claims: [
      { key: 'projectId', value: 'docs-v1', disclosable: false },
      { key: 'contributionType', value: 'documentation', disclosable: true },
      { key: 'hours', value: 8, disclosable: true },
    ],
  },
];

type ViewMode = 'inbox' | 'share' | 'detail';

export default function CredentialsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('inbox');
  const [selectedCredential, setSelectedCredential] = useState<VerifiableCredential | null>(null);

  const handleShare = (credential: VerifiableCredential) => {
    setSelectedCredential(credential);
    setViewMode('share');
  };

  const handleViewDetail = (credential: VerifiableCredential) => {
    setSelectedCredential(credential);
    setViewMode('detail');
  };

  const handleShareSubmit = async () => {
    // Mock share - in real app would generate SD-JWT presentation
    return `${window.location.origin}/verify?presentation=mock-sd-jwt-presentation`;
  };

  const handleBackToInbox = () => {
    setSelectedCredential(null);
    setViewMode('inbox');
  };

  // Selective Disclosure view
  if (viewMode === 'share' && selectedCredential) {
    return (
      <SelectiveDisclosure
        config={defaultConfig}
        credential={selectedCredential}
        onShare={handleShareSubmit}
        onBack={handleBackToInbox}
        onCancel={handleBackToInbox}
      />
    );
  }

  // Main inbox view with optional detail modal
  return (
    <>
      <CredentialInbox
        credentials={mockCredentials}
        onShareCredential={handleShare}
        onViewCredential={handleViewDetail}
        holderDid="did:cardano:stake1uq9l3d7y2q1z6k0j8n3m2p4w7v6c1b9a8t0s5r4e3d2f1g0h9"
        isWalletConnected={true}
      />

      {/* Detail Modal */}
      {viewMode === 'detail' && selectedCredential && (
        <CredentialDetailModal
          credential={selectedCredential}
          onClose={handleBackToInbox}
          onShare={() => {
            setViewMode('share');
          }}
          network={defaultConfig.NETWORK}
        />
      )}
    </>
  );
}
