'use client';

import { useState } from 'react';
import { VerifierView } from '@/components/VerifierView';
import { defaultConfig } from '@/config/org-config';

export default function VerifyPage() {
  return <VerifierView config={defaultConfig} />;
}
