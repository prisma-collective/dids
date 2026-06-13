'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@prisma-events/dids-ui';
import type { VCStatus } from '@/types/vc';

export interface StatusBadgeProps {
  status: VCStatus;
  className?: string;
}

const variantMap: Record<VCStatus, 'success' | 'error' | 'warning' | 'neutral'> = {
  active: 'success',
  revoked: 'error',
  pending: 'warning',
  not_found: 'neutral',
};

const labelKeys: Record<VCStatus, string> = {
  active: 'active',
  revoked: 'revoked',
  pending: 'pending',
  not_found: 'notFound',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const t = useTranslations('common');

  return (
    <Badge variant={variantMap[status]} dot className={className}>
      {t(labelKeys[status])}
    </Badge>
  );
}
