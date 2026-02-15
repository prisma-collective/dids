'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { VerifiableCredential, PresentationData } from '@/types/vc';
import type { VCInterfaceConfig } from '@/config/org-config';
import { defaultConfig } from '@/config/org-config';
import { Button, Card, Badge, cn, truncateDid, formatDate } from '@prisma-dids/ui';
import { ArrowLeft, Link2, Check, Copy } from 'lucide-react';
import { StatusBadge } from './shared/StatusBadge';
import { ClaimCheckbox } from './shared/ClaimCheckbox';

export interface SelectiveDisclosureProps {
  config?: Partial<VCInterfaceConfig>;
  credential: VerifiableCredential;
  onShare: (data: PresentationData) => Promise<string>;
  onCancel?: () => void;
  onBack?: () => void;
}

export function SelectiveDisclosure({
  config,
  credential,
  onShare,
  onCancel,
  onBack,
}: SelectiveDisclosureProps) {
  const fullConfig = { ...defaultConfig, ...config };
  const t = useTranslations('disclosure');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(() => {
    return new Set(
      credential.claims
        .filter(c => c.disclosable)
        .map(c => c.key)
    );
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [shareResult, setShareResult] = useState<{ url: string } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const alwaysVisibleClaims = credential.claims.filter(c => !c.disclosable);
  const disclosableClaims = credential.claims.filter(c => c.disclosable);

  const previewClaims = useMemo(() => {
    return [
      ...alwaysVisibleClaims,
      ...disclosableClaims.filter(c => selectedClaims.has(c.key)),
    ];
  }, [alwaysVisibleClaims, disclosableClaims, selectedClaims]);

  const handleToggleClaim = (key: string, checked: boolean) => {
    setSelectedClaims(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedClaims(new Set(disclosableClaims.map(c => c.key)));
  };

  const handleSelectNone = () => {
    setSelectedClaims(new Set());
  };

  const handleGenerateShare = async () => {
    setIsGenerating(true);
    try {
      const url = await onShare({
        credentialId: credential.id,
        selectedClaims: Array.from(selectedClaims),
      });
      setShareResult({ url });
    } catch (err) {
      console.error('Failed to generate share link:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (shareResult?.url) {
      await navigator.clipboard.writeText(shareResult.url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  // Share result view
  if (shareResult) {
    return (
      <div className="max-w-[800px] mx-auto p-4">
        <Card className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/15 mb-4 animate-scale-in">
            <Link2 className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            {t('shareLinkGenerated')}
          </h3>
          <p className="text-text-secondary mb-4">
            {t('shareLinkDesc')}
          </p>

          <div className="p-4 bg-background rounded-lg break-all text-xs font-mono text-text-secondary mt-4">
            {shareResult.url}
          </div>

          <div className="flex gap-3 justify-center mt-6">
            <Button onClick={handleCopyLink}>
              {copySuccess ? (
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  {t('copied')}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Copy className="h-4 w-4" />
                  {t('copyLink')}
                </span>
              )}
            </Button>
            <Button variant="secondary" onClick={() => setShareResult(null)}>
              {t('editSelection')}
            </Button>
          </div>

          {onBack && (
            <Button
              variant="secondary"
              className="mt-4"
              onClick={onBack}
            >
              {t('backToCredentials')}
            </Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto p-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            aria-label={tc('back')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h2 className="text-2xl font-semibold text-text-primary">{t('title')}</h2>
      </div>

      {/* Credential Summary */}
      <Card className="p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <Badge variant="info">{credential.type}</Badge>
          <StatusBadge status={credential.status} />
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <span className="text-text-muted">{tc('issuer')}:</span>
          <span className="text-text-secondary font-mono">{truncateDid(credential.issuerDid)}</span>
          <span className="text-text-muted">{tc('issued')}:</span>
          <span className="text-text-secondary">{formatDate(credential.issuedAt, locale)}</span>
        </div>
      </Card>

      {/* Claims Selection */}
      <Card className="p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-text-primary">{t('selectClaims')}</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="text-xs text-primary underline hover:no-underline"
            >
              {t('selectAll')}
            </button>
            <span className="text-text-muted">|</span>
            <button
              onClick={handleSelectNone}
              className="text-xs text-primary underline hover:no-underline"
            >
              {t('selectNone')}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {/* Always visible claims */}
          {alwaysVisibleClaims.map(claim => (
            <ClaimCheckbox
              key={claim.key}
              claimKey={claim.key}
              value={claim.value}
              checked={true}
              onChange={() => {}}
              disabled={true}
              alwaysVisible={true}
            />
          ))}

          {/* Disclosable claims */}
          {disclosableClaims.map(claim => (
            <ClaimCheckbox
              key={claim.key}
              claimKey={claim.key}
              value={claim.value}
              checked={selectedClaims.has(claim.key)}
              onChange={(checked) => handleToggleClaim(claim.key, checked)}
            />
          ))}
        </div>

        {/* Preview */}
        <div className="bg-background rounded-lg p-4 mt-4" aria-live="polite">
          <div className="text-xs font-semibold text-text-muted uppercase mb-3">
            {t('verifierWillSee')}
          </div>
          {previewClaims.length === 0 ? (
            <p className="text-text-muted text-sm">{t('selectAtLeastOne')}</p>
          ) : (
            previewClaims.map(claim => (
              <div
                key={claim.key}
                className="flex justify-between py-2 border-b border-border/30 text-sm last:border-0"
              >
                <span className="text-text-secondary">
                  {claim.key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className="text-text-primary font-medium">
                  {String(claim.value)}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3 mt-8">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
        )}
        <Button
          onClick={handleGenerateShare}
          disabled={isGenerating || previewClaims.length === 0}
          loading={isGenerating}
        >
          {isGenerating ? t('generating') : t('generateShareLink')}
        </Button>
      </div>
    </div>
  );
}
