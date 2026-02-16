'use client';

import { useSearchParams } from 'next/navigation';
import { VerifierView } from '@/components/VerifierView';
import { config } from '@/config/resolve-config';

export default function VerifyPage() {
  const searchParams = useSearchParams();
  // If a presentation was shared via URL, pre-fill the verifier
  const presentationParam = searchParams.get('p') || undefined;

  return (
    <VerifierView
      config={config}
      initialPresentation={presentationParam}
    />
  );
}
