'use client';

import { useTranslations, useLocale } from 'next-intl';
import type { VerifiableCredential } from '@/types/vc';
import { Card, Button, Badge, truncateDid, formatDate } from '@prisma-dids/ui';
import { StatusBadge } from './StatusBadge';

export interface VCCardProps {
  credential: VerifiableCredential;
  onView?: (credential: VerifiableCredential) => void;
  onShare?: (credential: VerifiableCredential) => void;
  onRevoke?: (credential: VerifiableCredential) => void;
  onVerify?: (credential: VerifiableCredential) => void;
  isIssuerView?: boolean;
  compact?: boolean;
}

export function VCCard({
  credential,
  onView,
  onShare,
  onRevoke,
  onVerify,
  isIssuerView = false,
  compact = false,
}: VCCardProps) {
  const t = useTranslations('common');
  const tt = useTranslations('types');
  const locale = useLocale();
  const isRevoked = credential.status === 'revoked';

  return (
    <Card className={`${compact ? 'p-4' : 'p-6'} ${isRevoked ? 'opacity-70' : ''}`}>
      <div className="flex justify-between items-start mb-3 gap-3 flex-wrap">
        <Badge variant="info">
          {tt(credential.type as any) || credential.type}
        </Badge>
        <StatusBadge status={credential.status} />
      </div>

      <div className="flex flex-col gap-2 mb-3">
        <div className="flex gap-2 text-sm">
          <span className="text-text-muted min-w-[60px]">
            {isIssuerView ? t('holder') : t('issuer')}:
          </span>
          <span className="text-text-secondary font-mono">
            {truncateDid(isIssuerView ? credential.holderDid : credential.issuerDid)}
          </span>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="text-text-muted min-w-[60px]">{t('issued')}:</span>
          <span className="text-text-secondary">
            {formatDate(credential.issuedAt, locale)}
          </span>
        </div>
        {!compact && credential.claims.length > 0 && (
          <div className="flex gap-2 text-sm">
            <span className="text-text-muted min-w-[60px]">{t('claims')}:</span>
            <span className="text-text-secondary">
              {t('fields', { count: credential.claims.length })}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {onView && (
          <Button variant="secondary" size="sm" onClick={() => onView(credential)}>
            {t('viewDetails')}
          </Button>
        )}
        {!isIssuerView && onShare && !isRevoked && credential.credentialString && (
          <Button size="sm" onClick={() => onShare(credential)}>
            {t('share')}
          </Button>
        )}
        {!isIssuerView && onVerify && credential.credentialString && (
          <Button variant="secondary" size="sm" onClick={() => onVerify(credential)}>
            {t('verify')}
          </Button>
        )}
        {isIssuerView && onRevoke && !isRevoked && (
          <Button variant="danger" size="sm" onClick={() => onRevoke(credential)}>
            {t('revoke')}
          </Button>
        )}
      </div>
    </Card>
  );
}
