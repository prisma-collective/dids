'use client';

import { RevocationUI } from '@/components/RevocationUI';
import { defaultConfig } from '@/config/org-config';
import type { VerifiableCredential, RevocationRequest } from '@/types/vc';

// Mock data for UI demonstration
const mockIssuedCredentials: VerifiableCredential[] = [
  {
    id: 'vc-issued-001',
    type: 'ContributionCredential',
    issuerDid: 'did:cardano:stake1ux7l5d9y4q3z8k2j0n5m4p6w9v8c3b1a0t2s7r6e5d4f3g2h1',
    holderDid: 'did:cardano:stake1uq9l3d7y2q1z6k0j8n3m2p4w7v6c1b9a8t0s5r4e3d2f1g0h9',
    issuedAt: '2024-12-01T10:00:00Z',
    status: 'active',
    claims: [
      { key: 'projectId', value: 'catalyst-fund-14', disclosable: false },
      { key: 'contributionType', value: 'code', disclosable: true },
    ],
  },
  {
    id: 'vc-issued-002',
    type: 'ContributionCredential',
    issuerDid: 'did:cardano:stake1ux7l5d9y4q3z8k2j0n5m4p6w9v8c3b1a0t2s7r6e5d4f3g2h1',
    holderDid: 'did:cardano:stake1up8k2d6y3q0z5k1j7n2m1p3w6v5c0b8a7t9s4r3e2d1f0g9h8',
    issuedAt: '2024-11-20T09:15:00Z',
    status: 'active',
    claims: [
      { key: 'projectId', value: 'governance-tool', disclosable: false },
      { key: 'contributionType', value: 'design', disclosable: true },
    ],
  },
  {
    id: 'vc-issued-003',
    type: 'ContributionCredential',
    issuerDid: 'did:cardano:stake1ux7l5d9y4q3z8k2j0n5m4p6w9v8c3b1a0t2s7r6e5d4f3g2h1',
    holderDid: 'did:cardano:stake1uq9l3d7y2q1z6k0j8n3m2p4w7v6c1b9a8t0s5r4e3d2f1g0h9',
    issuedAt: '2024-10-05T16:45:00Z',
    status: 'revoked',
    claims: [
      { key: 'projectId', value: 'old-project', disclosable: false },
      { key: 'contributionType', value: 'review', disclosable: true },
    ],
  },
];

export default function ManagePage() {
  const handleRevoke = async (request: RevocationRequest) => {
    // Mock revocation - in real app would call SDK to revoke VC
    console.log('Revoking credential:', request);
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Simulating success
  };

  return (
    <RevocationUI
      config={defaultConfig}
      issuedCredentials={mockIssuedCredentials}
      onRevoke={handleRevoke}
      issuerDid="did:cardano:stake1ux7l5d9y4q3z8k2j0n5m4p6w9v8c3b1a0t2s7r6e5d4f3g2h1"
    />
  );
}
