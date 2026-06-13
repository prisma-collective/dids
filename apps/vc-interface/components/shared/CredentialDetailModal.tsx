'use client';

import { useTranslations, useLocale } from 'next-intl';
import type { VerifiableCredential } from '@/types/vc';
import { Modal, Button, Card, Badge, truncateDid, formatDate, CopyButton } from '@prisma-events/dids-ui';
import { ExternalLink } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

export interface CredentialDetailModalProps {
  credential: VerifiableCredential;
  onClose: () => void;
  onShare?: () => void;
  network?: 'preprod' | 'mainnet';
}

export function CredentialDetailModal({
  credential,
  onClose,
  onShare,
  network = 'preprod',
}: CredentialDetailModalProps) {
  const t = useTranslations('detail');
  const tc = useTranslations('common');
  const locale = useLocale();

  const explorerBaseUrl = network === 'mainnet'
    ? 'https://cardanoscan.io/transaction'
    : 'https://preprod.cardanoscan.io/transaction';

  const ipfsGateway = 'https://gateway.pinata.cloud/ipfs';
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';

  return (
    <Modal open onClose={onClose} title={t('title')}>
      {/* Type and Status */}
      <div className="flex items-center gap-3 mb-4">
        <Badge variant="info">{credential.type}</Badge>
        <StatusBadge status={credential.status} />
      </div>

      {/* Basic Info */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          {t('basicInfo')}
        </h3>
        <div className="flex justify-between items-start py-2.5 border-b border-border/30 gap-4">
          <span className="text-sm text-text-muted">{t('credentialId')}</span>
          <span className="text-sm font-mono text-text-secondary text-right break-all">{credential.id}</span>
        </div>
        <div className="flex justify-between items-start py-2.5 border-b border-border/30 gap-4">
          <span className="text-sm text-text-muted">{tc('issued')}</span>
          <span className="text-sm text-text-primary text-right">{formatDate(credential.issuedAt, locale)}</span>
        </div>
        {credential.expiresAt && (
          <div className="flex justify-between items-start py-2.5 border-b border-border/30 gap-4">
            <span className="text-sm text-text-muted">{tc('expires')}</span>
            <span className="text-sm text-text-primary text-right">{formatDate(credential.expiresAt, locale)}</span>
          </div>
        )}
      </section>

      {/* Parties */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          {t('parties')}
        </h3>
        <div className="flex justify-between items-start py-2.5 border-b border-border/30 gap-4">
          <span className="text-sm text-text-muted shrink-0">{tc('issuer')} DID</span>
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              <span className="text-xs font-mono text-text-secondary">{truncateDid(credential.issuerDid, 16)}</span>
              <CopyButton value={credential.issuerDid} />
            </div>
            <a
              href={`${dashboardUrl}?did=${encodeURIComponent(credential.issuerDid)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              {t('viewDIDDashboard')} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="flex justify-between items-start py-2.5 border-b border-border/30 gap-4">
          <span className="text-sm text-text-muted shrink-0">{tc('holder')} DID</span>
          <div className="flex items-center gap-1 justify-end">
            <span className="text-xs font-mono text-text-secondary">{truncateDid(credential.holderDid, 16)}</span>
            <CopyButton value={credential.holderDid} />
          </div>
        </div>
      </section>

      {/* Claims */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          {tc('claims')} ({credential.claims.length})
        </h3>
        {credential.claims.map((claim, i) => (
          <div key={i} className="flex justify-between p-3 bg-background rounded-md mb-2">
            <span className="text-text-secondary capitalize text-sm">
              {claim.key.replace(/([A-Z])/g, ' $1').trim()}
              {!claim.disclosable && (
                <span className="ml-2 text-[0.65rem] px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                  {tc('alwaysVisible')}
                </span>
              )}
            </span>
            <span className="text-text-primary font-medium text-sm">{String(claim.value)}</span>
          </div>
        ))}
      </section>

      {/* On-Chain References */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          {t('onChain')}
        </h3>
        {credential.txHash ? (
          <div className="flex justify-between items-start py-2.5 border-b border-border/30 gap-4">
            <span className="text-sm text-text-muted">{t('transaction')}</span>
            <div className="text-right">
              <div className="text-xs font-mono text-text-secondary">{credential.txHash.slice(0, 20)}...</div>
              <a
                href={`${explorerBaseUrl}/${credential.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                {t('viewCardanoScan')} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            {t('transaction')}: N/A
          </p>
        )}
        {credential.ipfsCid && (
          <div className="flex justify-between items-start py-2.5 border-b border-border/30 gap-4">
            <span className="text-sm text-text-muted">{t('ipfsCid')}</span>
            <div className="text-right">
              <div className="text-xs font-mono text-text-secondary">{credential.ipfsCid.slice(0, 20)}...</div>
              <a
                href={`${ipfsGateway}/${credential.ipfsCid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                {t('viewIPFS')} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <Button variant="secondary" onClick={onClose}>{tc('close')}</Button>
        {onShare && credential.status === 'active' && (
          <Button onClick={onShare}>{t('shareCredential')}</Button>
        )}
      </div>
    </Modal>
  );
}
