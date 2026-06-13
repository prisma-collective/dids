'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { VerifiableCredential, RevocationReason, RevocationRequest } from '@/types/vc';
import type { VCInterfaceConfig } from '@/config/org-config';
import { defaultConfig } from '@/config/org-config';
import {
  Button,
  Card,
  Modal,
  Input,
  Select,
  LoadingState,
  EmptyState,
  cn,
  truncateDid,
  formatDate,
} from '@prisma-events/dids-ui';
import { CheckCircle, AlertTriangle, ClipboardList, CheckCheck, Search } from 'lucide-react';
import { VCCard } from './shared/VCCard';
import { CredentialDetailModal } from './shared/CredentialDetailModal';

export interface RevocationUIProps {
  config?: Partial<VCInterfaceConfig>;
  issuedCredentials: VerifiableCredential[];
  onRevoke: (request: RevocationRequest) => Promise<{ txHash?: string } | void>;
  issuerDid?: string;
  isLoading?: boolean;
  network?: 'preprod' | 'mainnet';
}

export function RevocationUI({
  config,
  issuedCredentials,
  onRevoke,
  issuerDid,
  isLoading = false,
  network = 'preprod',
}: RevocationUIProps) {
  const fullConfig = { ...defaultConfig, ...config };
  const t = useTranslations('revocation');
  const tc = useTranslations('common');
  const locale = useLocale();

  const activeCredentials = issuedCredentials.filter(c => c.status === 'active');
  const revokedCredentials = issuedCredentials.filter(c => c.status === 'revoked');

  const [selectedCredential, setSelectedCredential] = useState<VerifiableCredential | null>(null);
  const [detailCredential, setDetailCredential] = useState<VerifiableCredential | null>(null);
  const [revocationReason, setRevocationReason] = useState<RevocationReason>('issued_in_error');
  const [customReason, setCustomReason] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [revokeResult, setRevokeResult] = useState<{ success: boolean; txHash?: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [didFilter, setDidFilter] = useState('');

  const handleRevokeClick = (credential: VerifiableCredential) => {
    setSelectedCredential(credential);
    setRevocationReason('issued_in_error');
    setCustomReason('');
    setShowConfirm(false);
    setRevokeResult(null);
  };

  const handleConfirmRevoke = async () => {
    if (!selectedCredential) return;
    setIsRevoking(true);
    try {
      const result = await onRevoke({
        credentialId: selectedCredential.id,
        reason: revocationReason,
        customReason: revocationReason === 'other' ? customReason : undefined,
      });
      setRevokeResult({ success: true, txHash: (result as any)?.txHash });
    } catch {
      setRevokeResult({ success: false });
    } finally {
      setIsRevoking(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedCredential(null);
    setShowConfirm(false);
    setRevokeResult(null);
  };

  const reasonOptions: Array<{ value: string; label: string }> = [
    { value: 'issued_in_error', label: t('reasons.issued_in_error') },
    { value: 'holder_request', label: t('reasons.holder_request') },
    { value: 'policy_violation', label: t('reasons.policy_violation') },
    { value: 'expired', label: t('reasons.expired') },
    { value: 'other', label: t('reasons.other') },
  ];

  if (isLoading) {
    return (
      <div className="max-w-[900px] mx-auto p-4">
        <LoadingState label={t('loadingIssued')} />
      </div>
    );
  }

  const baseCredentials = showHistory ? revokedCredentials : activeCredentials;
  const displayedCredentials = didFilter.trim()
    ? baseCredentials.filter(c => {
        const q = didFilter.trim().toLowerCase();
        return c.issuerDid.toLowerCase().includes(q) || c.holderDid.toLowerCase().includes(q);
      })
    : baseCredentials;

  return (
    <div className="max-w-[900px] mx-auto p-4">
      <h2 className="text-2xl font-semibold text-text-primary mb-6">{t('title')}</h2>

      {/* Stats */}
      <div className="flex gap-4 mb-6">
        <Card className="p-4 flex-1 text-center">
          <div className="text-3xl font-bold text-success">{activeCredentials.length}</div>
          <div className="text-xs text-text-muted uppercase">{tc('active')}</div>
        </Card>
        <Card className="p-4 flex-1 text-center">
          <div className="text-3xl font-bold text-error">{revokedCredentials.length}</div>
          <div className="text-xs text-text-muted uppercase">{tc('revoked')}</div>
        </Card>
        <Card className="p-4 flex-1 text-center">
          <div className="text-3xl font-bold text-text-primary">{issuedCredentials.length}</div>
          <div className="text-xs text-text-muted uppercase">{tc('total')}</div>
        </Card>
      </div>

      {/* Toggle */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={!showHistory ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setShowHistory(false)}
        >
          {t('activeCount', { count: activeCredentials.length })}
        </Button>
        <Button
          variant={showHistory ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setShowHistory(true)}
        >
          {t('revokedCount', { count: revokedCredentials.length })}
        </Button>
      </div>

      {/* DID Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
        <input
          type="text"
          value={didFilter}
          onChange={(e) => setDidFilter(e.target.value)}
          placeholder={t('searchByDid')}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Grid */}
      {displayedCredentials.length === 0 ? (
        <EmptyState
          icon={showHistory
            ? <ClipboardList className="h-8 w-8 text-text-muted" />
            : <CheckCheck className="h-8 w-8 text-text-muted" />
          }
          title={showHistory ? t('noRevoked') : t('noActive')}
          description={showHistory ? t('noRevokedDesc') : t('noActiveDesc')}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {displayedCredentials.map(credential => (
            <VCCard
              key={credential.id}
              credential={credential}
              onView={() => setDetailCredential(credential)}
              onRevoke={() => handleRevokeClick(credential)}
              isIssuerView={true}
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detailCredential && (
        <CredentialDetailModal
          credential={detailCredential}
          onClose={() => setDetailCredential(null)}
          network={network}
        />
      )}

      {/* Revocation Modal */}
      {selectedCredential && (
        <Modal
          open
          onClose={handleCloseModal}
          title={revokeResult ? (revokeResult.success ? t('revokedTitle') : t('failedTitle')) : t('revokeTitle')}
          alert={showConfirm}
        >
          {revokeResult?.success ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success/15 mb-3 animate-scale-in">
                <CheckCircle className="h-6 w-6 text-success" />
              </div>
              <p className="text-text-secondary mb-4">{t('revokedSuccess')}</p>
              {revokeResult.txHash && (
                <div className="p-3 bg-background rounded-md text-xs font-mono text-text-muted mb-4 break-all">
                  Tx: {revokeResult.txHash}
                </div>
              )}
              <Button onClick={handleCloseModal}>{tc('done')}</Button>
            </div>
          ) : (
            <>
              {/* Credential Summary */}
              <div className="p-4 bg-background rounded-lg mb-6">
                <div className="flex justify-between mb-2">
                  <span className="text-xs text-text-muted">{tc('type')}</span>
                  <span className="text-sm text-text-primary font-medium">{selectedCredential.type}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs text-text-muted">{tc('holder')}</span>
                  <span className="text-sm text-text-secondary font-mono">{truncateDid(selectedCredential.holderDid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-text-muted">{tc('issued')}</span>
                  <span className="text-sm text-text-secondary">{formatDate(selectedCredential.issuedAt, locale)}</span>
                </div>
              </div>

              {!showConfirm ? (
                <>
                  <div className="mb-5">
                    <label className="block text-sm text-text-secondary mb-2 font-medium">
                      {t('reason')} *
                    </label>
                    <Select
                      value={revocationReason}
                      onChange={(e) => setRevocationReason(e.target.value as RevocationReason)}
                    >
                      {reasonOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Select>
                  </div>

                  {revocationReason === 'other' && (
                    <div className="mb-5">
                      <label className="block text-sm text-text-secondary mb-2 font-medium">
                        {t('customReason')} *
                      </label>
                      <Input
                        value={customReason}
                        onChange={(e) => setCustomReason(e.target.value)}
                        placeholder={t('customPlaceholder')}
                        required
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <Button variant="secondary" onClick={handleCloseModal}>{tc('cancel')}</Button>
                    <Button
                      variant="danger"
                      onClick={() => setShowConfirm(true)}
                      disabled={revocationReason === 'other' && !customReason.trim()}
                    >
                      {t('continue')}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div role="alert" className="p-4 rounded-lg mb-4 bg-warning/15 border border-warning text-warning text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4" />
                      <strong>{t('warningTitle')}</strong>
                    </div>
                    {t('warningDesc')}
                  </div>

                  <div className="mb-4">
                    <span className="text-xs text-text-muted">{t('reasonLabel')}</span>
                    <span className="text-text-primary ml-2">
                      {revocationReason === 'other' ? customReason : reasonOptions.find(r => r.value === revocationReason)?.label}
                    </span>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <Button variant="secondary" onClick={() => setShowConfirm(false)}>{tc('back')}</Button>
                    <Button
                      variant="danger"
                      onClick={handleConfirmRevoke}
                      disabled={isRevoking}
                      loading={isRevoking}
                    >
                      {isRevoking ? t('revoking') : t('confirmRevocation')}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
