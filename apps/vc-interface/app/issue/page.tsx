'use client';

import { IssuanceForm } from '@/components/IssuanceForm';
import { useWallet } from '@/contexts/WalletContext';
import { config } from '@/config/resolve-config';
import { issueAndAnchorCredential } from '@/services/vcService';
import { storeCredential } from '@/services/credentialStore';
import type { IssuanceFormData } from '@/types/vc';
import { Button, EmptyState } from '@prisma-dids/ui';

export default function IssuePage() {
  const { wallet, signingAddress, did, connecting, connect, availableWallets } = useWallet();

  const blockfrostKey = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY;

  const handleSubmit = async (data: IssuanceFormData) => {
    if (!wallet || !signingAddress || !did) {
      throw new Error('Wallet not connected');
    }

    if (!blockfrostKey) {
      throw new Error('NEXT_PUBLIC_BLOCKFROST_API_KEY not configured');
    }

    const result = await issueAndAnchorCredential(
      wallet,
      signingAddress,
      did,
      data.holderDid,
      data,
      { network: config.NETWORK, blockfrostApiKey: blockfrostKey }
    );

    // Store credential locally (holder can retrieve it from localStorage)
    storeCredential({
      credentialString: result.credential,
      jti: result.jti,
      vct: data.credentialType,
      issuerDid: did,
      holderDid: data.holderDid,
      issuedAt: new Date().toISOString(),
      txHash: result.txHash,
    });
  };

  // Wallet not connected
  if (!wallet || !did) {
    return (
      <div className="max-w-[600px] mx-auto p-4">
        <EmptyState
          title="Connect Wallet to Issue"
          description="You need a connected Cardano wallet to issue Verifiable Credentials."
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

  // Check issuer authorization
  const isAuthorized = config.ISSUER_DIDS.length === 0 || config.ISSUER_DIDS.includes(did);
  if (!isAuthorized) {
    return (
      <div className="max-w-[600px] mx-auto p-4">
        <EmptyState
          title="Not Authorized"
          description={`Your DID (${did.slice(0, 30)}...) is not in the authorized issuers list for ${config.ORG_NAME}.`}
        />
      </div>
    );
  }

  return (
    <IssuanceForm
      config={config}
      onSubmit={handleSubmit}
      issuerDid={did}
    />
  );
}
