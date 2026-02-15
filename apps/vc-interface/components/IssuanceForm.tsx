'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CredentialType, IssuanceFormData } from '@/types/vc';
import type { VCInterfaceConfig } from '@/config/org-config';
import { defaultConfig } from '@/config/org-config';
import { Button, Input, Select, Card } from '@prisma-dids/ui';
import { CheckCircle } from 'lucide-react';

export interface IssuanceFormProps {
  config?: Partial<VCInterfaceConfig>;
  onSubmit: (data: IssuanceFormData) => Promise<void>;
  onCancel?: () => void;
  knownHolderDids?: string[];
  issuerDid?: string;
}

const credentialFields: Record<CredentialType, Array<{
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  required: boolean;
  options?: string[];
  defaultDisclosable: boolean;
}>> = {
  ContributionCredential: [
    { key: 'projectId', label: 'Project ID', type: 'text', required: true, defaultDisclosable: true },
    { key: 'contributionType', label: 'Contribution Type', type: 'select', required: true, options: ['code', 'design', 'documentation', 'review', 'mentorship', 'other'], defaultDisclosable: true },
    { key: 'hours', label: 'Hours', type: 'number', required: false, defaultDisclosable: false },
    { key: 'organization', label: 'Organization', type: 'text', required: true, defaultDisclosable: true },
    { key: 'description', label: 'Description', type: 'text', required: false, defaultDisclosable: true },
    { key: 'evidenceUrl', label: 'Evidence URL', type: 'text', required: false, defaultDisclosable: false },
  ],
  MembershipCredential: [
    { key: 'organization', label: 'Organization', type: 'text', required: true, defaultDisclosable: true },
    { key: 'role', label: 'Role', type: 'text', required: true, defaultDisclosable: true },
    { key: 'department', label: 'Department', type: 'text', required: false, defaultDisclosable: false },
  ],
  AchievementCredential: [
    { key: 'achievementName', label: 'Achievement Name', type: 'text', required: true, defaultDisclosable: true },
    { key: 'description', label: 'Description', type: 'text', required: true, defaultDisclosable: true },
    { key: 'criteria', label: 'Criteria Met', type: 'text', required: false, defaultDisclosable: true },
  ],
};

export function IssuanceForm({
  config,
  onSubmit,
  onCancel,
  knownHolderDids = [],
  issuerDid,
}: IssuanceFormProps) {
  const fullConfig = { ...defaultConfig, ...config };
  const t = useTranslations('issuance');
  const tc = useTranslations('common');

  const [holderDid, setHolderDid] = useState('');
  const [credentialType, setCredentialType] = useState<CredentialType>(
    fullConfig.CREDENTIAL_TYPES[0] || 'ContributionCredential'
  );
  const [claims, setClaims] = useState<Record<string, string | number>>({});
  const [disclosableClaims, setDisclosableClaims] = useState<Set<string>>(() => {
    const fields = credentialFields[credentialType] || [];
    return new Set(fields.filter(f => f.defaultDisclosable).map(f => f.key));
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string; txHash?: string } | null>(null);

  const currentFields = credentialFields[credentialType] || [];

  const handleTypeChange = (newType: CredentialType) => {
    setCredentialType(newType);
    setClaims({});
    const fields = credentialFields[newType] || [];
    setDisclosableClaims(new Set(fields.filter(f => f.defaultDisclosable).map(f => f.key)));
  };

  const handleClaimChange = (key: string, value: string | number) => {
    setClaims(prev => ({ ...prev, [key]: value }));
  };

  const toggleDisclosable = (key: string) => {
    setDisclosableClaims(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      await onSubmit({ holderDid, credentialType, claims, disclosableClaims: Array.from(disclosableClaims) });
      setSubmitResult({ success: true, message: t('successTitle'), txHash: 'mock_tx_hash_' + Date.now() });
    } catch (err) {
      setSubmitResult({ success: false, message: err instanceof Error ? err.message : t('failedToIssue') });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitResult?.success) {
    return (
      <Card className="max-w-[600px] mx-auto p-6">
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success/15 mb-3 animate-scale-in">
            <CheckCircle className="h-6 w-6 text-success" />
          </div>
          <h3 className="text-lg font-semibold text-success mb-2">{t('successTitle')}</h3>
          <p className="text-text-secondary mb-6">{t('successDesc')}</p>
          {submitResult.txHash && (
            <div className="p-4 bg-background rounded-lg mb-6">
              <label className="block text-sm text-text-secondary mb-1">{t('transactionHash')}</label>
              <code className="text-sm text-text-primary">{submitResult.txHash}</code>
            </div>
          )}
          <Button onClick={() => { setSubmitResult(null); setHolderDid(''); setClaims({}); }}>
            {t('issueAnother')}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="max-w-[600px] mx-auto p-6">
      <div className="flex items-center gap-4 mb-8">
        <h2 className="text-2xl font-semibold text-text-primary">{t('title')}</h2>
        <span className="text-xs text-text-muted px-3 py-1 bg-background rounded">
          {fullConfig.ORG_NAME}
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-5">
          <label htmlFor="holder-did" className="block text-sm text-text-secondary mb-2 font-medium">
            {t('holderDid')} *
          </label>
          <Input
            id="holder-did"
            value={holderDid}
            onChange={(e) => setHolderDid(e.target.value)}
            placeholder={t('holderPlaceholder')}
            required
            list="holder-dids"
          />
          {knownHolderDids.length > 0 && (
            <datalist id="holder-dids">
              {knownHolderDids.map(did => (
                <option key={did} value={did} />
              ))}
            </datalist>
          )}
        </div>

        <div className="mb-5">
          <label htmlFor="cred-type" className="block text-sm text-text-secondary mb-2 font-medium">
            {t('credentialType')} *
          </label>
          <Select
            id="cred-type"
            value={credentialType}
            onChange={(e) => handleTypeChange(e.target.value as CredentialType)}
          >
            {fullConfig.CREDENTIAL_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>
        </div>

        <h3 className="text-base font-semibold text-text-primary mb-4 mt-6 pt-4 border-t border-border">
          {t('credentialClaims')}
        </h3>

        {currentFields.map(field => (
          <div key={field.key} className="mb-5">
            <label className="block text-sm text-text-secondary mb-2 font-medium">
              {field.label} {field.required && '*'}
            </label>
            {field.type === 'select' ? (
              <Select
                value={(claims[field.key] as string) || ''}
                onChange={(e) => handleClaimChange(field.key, e.target.value)}
                required={field.required}
              >
                <option value="">{t('select')}</option>
                {field.options?.map(opt => (
                  <option key={opt} value={opt}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </Select>
            ) : field.type === 'number' ? (
              <Input
                type="number"
                value={(claims[field.key] as number) || ''}
                onChange={(e) => handleClaimChange(field.key, parseFloat(e.target.value) || 0)}
                required={field.required}
                min="0"
              />
            ) : (
              <Input
                type="text"
                value={(claims[field.key] as string) || ''}
                onChange={(e) => handleClaimChange(field.key, e.target.value)}
                required={field.required}
              />
            )}
            <label className="flex items-center gap-2 mt-2 text-xs text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={disclosableClaims.has(field.key)}
                onChange={() => toggleDisclosable(field.key)}
                className="accent-primary"
              />
              {t('disclosable')}
            </label>
          </div>
        ))}

        {submitResult && !submitResult.success && (
          <div role="alert" className="p-4 rounded-lg mb-4 bg-error/15 text-error text-sm">
            {submitResult.message}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-border">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
              {tc('cancel')}
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? t('issuing') : t('issueButton')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
