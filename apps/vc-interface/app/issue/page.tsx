'use client';

import { IssuanceForm } from '@/components/IssuanceForm';
import { defaultConfig } from '@/config/org-config';
import type { IssuanceFormData } from '@/types/vc';

export default function IssuePage() {
  const handleSubmit = async (data: IssuanceFormData) => {
    // Mock issuance - in real app would call SDK to issue VC
    console.log('Issuing credential:', data);
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Simulating success
  };

  return (
    <IssuanceForm
      config={defaultConfig}
      onSubmit={handleSubmit}
      issuerDid="did:cardano:stake1ux7l5d9y4q3z8k2j0n5m4p6w9v8c3b1a0t2s7r6e5d4f3g2h1"
      knownHolderDids={[
        'did:cardano:stake1uq9l3d7y2q1z6k0j8n3m2p4w7v6c1b9a8t0s5r4e3d2f1g0h9',
        'did:cardano:stake1up8k2d6y3q0z5k1j7n2m1p3w6v5c0b8a7t9s4r3e2d1f0g9h8',
      ]}
    />
  );
}
