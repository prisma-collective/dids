'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CredentialType, IssuanceFormData } from '@/types/vc';
import type { IssueStep } from '@/services/vcService';
import type { VCInterfaceConfig } from '@/config/org-config';
import { defaultConfig } from '@/config/org-config';
import { Button, Input, Select, Card, ProgressSteps } from '@prisma-dids/ui';
import { CheckCircle } from 'lucide-react';

/** Steps shown in the stepper (matches IssueStep from vcService) */
const stepOrder: IssueStep[] = [
  'signing-credential',
  'pinning-ipfs',
  'anchoring-tx',
];

export interface IssuanceFormProps {
  config?: Partial<VCInterfaceConfig>;
  onSubmit: (
    data: IssuanceFormData,
    onProgress: (step: IssueStep) => void,
  ) => Promise<{ txHash?: string } | void>;
  onCancel?: () => void;
  knownHolderDids?: string[];
  issuerDid?: string;
}

/**
 * canDisclose: whether the schema allows this field to be selectively disclosed.
 * Required/core identity fields (projectId, contributionType, org) are always
 * included in the credential — only optional fields can be hidden by the holder.
 */
const credentialFields: Record<CredentialType, Array<{
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  required: boolean;
  options?: string[];
  canDisclose: boolean;
  defaultDisclosed: boolean;
}>> = {
  ContributionCredential: [
    { key: 'projectId', label: 'Project ID', type: 'text', required: true, canDisclose: false, defaultDisclosed: false },
    { key: 'contributionType', label: 'Contribution Type', type: 'select', required: true, options: ['code', 'design', 'documentation', 'review', 'mentorship', 'other'], canDisclose: false, defaultDisclosed: false },
    { key: 'hours', label: 'Hours', type: 'number', required: false, canDisclose: true, defaultDisclosed: false },
    { key: 'organization', label: 'Organization', type: 'text', required: true, canDisclose: false, defaultDisclosed: false },
    { key: 'description', label: 'Description', type: 'text', required: false, canDisclose: true, defaultDisclosed: true },
    { key: 'evidenceUrl', label: 'Evidence URL', type: 'text', required: false, canDisclose: true, defaultDisclosed: false },
  ],
  MembershipCredential: [
    { key: 'organization', label: 'Organization', type: 'text', required: true, canDisclose: false, defaultDisclosed: false },
    { key: 'role', label: 'Role', type: 'text', required: true, canDisclose: false, defaultDisclosed: false },
    { key: 'department', label: 'Department', type: 'text', required: false, canDisclose: true, defaultDisclosed: false },
  ],
  AchievementCredential: [
    { key: 'achievementName', label: 'Achievement Name', type: 'text', required: true, canDisclose: false, defaultDisclosed: false },
    { key: 'description', label: 'Description', type: 'text', required: true, canDisclose: false, defaultDisclosed: false },
    { key: 'criteria', label: 'Criteria Met', type: 'text', required: false, canDisclose: true, defaultDisclosed: true },
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
    return new Set(fields.filter(f => f.canDisclose && f.defaultDisclosed).map(f => f.key));
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<IssueStep | null>(null);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string; txHash?: string } | null>(null);

  const currentFields = credentialFields[credentialType] || [];

  const handleTypeChange = (newType: CredentialType) => {
    setCredentialType(newType);
    setClaims({});
    const fields = credentialFields[newType] || [];
    setDisclosableClaims(new Set(fields.filter(f => f.canDisclose && f.defaultDisclosed).map(f => f.key)));
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
    setCurrentStep(null);
    setSubmitResult(null);
    try {
      const result = await onSubmit(
        { holderDid, credentialType, claims, disclosableClaims: Array.from(disclosableClaims) },
        (step) => setCurrentStep(step),
      );
      setSubmitResult({ success: true, message: t('successTitle'), txHash: (result as any)?.txHash });
    } catch (err) {
      setSubmitResult({ success: false, message: err instanceof Error ? err.message : t('failedToIssue') });
    } finally {
      setIsSubmitting(false);
      setCurrentStep(null);
    }
  };

  if (submitResult?.success) {
    return (
      <Card className="max-w-[600px] mx-auto p-5">
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-success/15 mb-3 animate-scale-in">
            <CheckCircle className="h-5 w-5 text-success" />
          </div>
          <h3 className="text-lg font-semibold text-success mb-1">{t('successTitle')}</h3>
          <p className="text-text-secondary text-sm mb-4">{t('successDesc')}</p>
          {submitResult.txHash && (
            <div className="p-3 bg-background rounded-lg mb-4">
              <label className="block text-xs text-text-secondary mb-1">{t('transactionHash')}</label>
              <code className="text-xs text-text-primary break-all">{submitResult.txHash}</code>
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
    <Card className="max-w-[600px] mx-auto px-5 pt-4 pb-5">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold text-text-primary">{t('title')}</h2>
        <span className="text-xs text-text-muted px-2 py-0.5 bg-background rounded">
          {fullConfig.ORG_NAME}
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="holder-did" className="block text-sm text-text-secondary mb-1.5 font-medium">
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

        <div className="mb-4">
          <label htmlFor="cred-type" className="block text-sm text-text-secondary mb-1.5 font-medium">
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

        <h3 className="text-sm font-semibold text-text-primary mb-3 mt-4 pt-3 border-t border-border">
          {t('credentialClaims')}
        </h3>

        {currentFields.map(field => (
          <div key={field.key} className="mb-4">
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
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
            {field.canDisclose ? (
              <label className="flex items-center gap-2 mt-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={disclosableClaims.has(field.key)}
                  onChange={() => toggleDisclosable(field.key)}
                  className="accent-primary"
                />
                {t('disclosable')}
              </label>
            ) : (
              <p className="mt-1.5 text-xs text-text-muted">{t('alwaysIncluded')}</p>
            )}
          </div>
        ))}

        {submitResult && !submitResult.success && (
          <div role="alert" className="p-4 rounded-lg mb-4 bg-error/15 text-error text-sm">
            {submitResult.message}
          </div>
        )}

        {/* Issuance progress stepper */}
        {isSubmitting && currentStep && (
          <div className="p-4 bg-background rounded-lg mb-4 border border-border">
            <ProgressSteps
              steps={stepOrder.map(id => ({ id, label: t(`steps.${id}`) }))}
              currentStep={currentStep}
            />
          </div>
        )}

        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-border">
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
