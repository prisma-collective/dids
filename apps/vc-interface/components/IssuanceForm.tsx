import React, { useState } from 'react';
import type { CredentialType, IssuanceFormData } from '@/types/vc';
import type { VCInterfaceConfig } from '@/config/org-config';
import { defaultConfig } from '@/config/org-config';
import {
  getTheme,
  cardStyles,
  primaryButtonStyles,
  secondaryButtonStyles,
  inputStyles,
  labelStyles,
} from '@/styles';

export interface IssuanceFormProps {
  /** Organization configuration */
  config?: Partial<VCInterfaceConfig>;
  /** Called when form is submitted */
  onSubmit: (data: IssuanceFormData) => Promise<void>;
  /** Called when user cancels */
  onCancel?: () => void;
  /** Known holder DIDs for autocomplete */
  knownHolderDids?: string[];
  /** Current issuer DID */
  issuerDid?: string;
}

/** Claim field definitions for each credential type */
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
    {
      key: 'contributionType',
      label: 'Contribution Type',
      type: 'select',
      required: true,
      options: ['code', 'design', 'documentation', 'review', 'mentorship', 'other'],
      defaultDisclosable: true,
    },
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

/**
 * IssuanceForm Component (Issuer View)
 *
 * Form for issuers to create new Verifiable Credentials.
 * Features:
 * - Holder DID input (with optional autocomplete)
 * - Credential type selection
 * - Dynamic claim fields based on credential type
 * - Disclosable claims checkboxes
 */
export function IssuanceForm({
  config,
  onSubmit,
  onCancel,
  knownHolderDids = [],
  issuerDid,
}: IssuanceFormProps) {
  const fullConfig = { ...defaultConfig, ...config };
  const theme = getTheme(fullConfig.THEME);

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
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      await onSubmit({
        holderDid,
        credentialType,
        claims,
        disclosableClaims: Array.from(disclosableClaims),
      });
      setSubmitResult({
        success: true,
        message: 'Credential issued successfully!',
        txHash: 'mock_tx_hash_' + Date.now(), // Mock for UI demo
      });
    } catch (err) {
      setSubmitResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to issue credential',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Container styles
  const containerStyle: React.CSSProperties = {
    ...cardStyles(theme),
    maxWidth: '600px',
    margin: '0 auto',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '2rem',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: theme.text.primary,
    margin: 0,
  };

  const formGroupStyle: React.CSSProperties = {
    marginBottom: '1.25rem',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyles(theme),
    cursor: 'pointer',
  };

  const checkboxContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.5rem',
    fontSize: '0.8rem',
    color: theme.text.secondary,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 600,
    color: theme.text.primary,
    marginBottom: '1rem',
    marginTop: '1.5rem',
    paddingTop: '1rem',
    borderTop: `1px solid ${theme.text.muted}33`,
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    marginTop: '2rem',
    paddingTop: '1.5rem',
    borderTop: `1px solid ${theme.text.muted}33`,
  };

  const resultStyle: React.CSSProperties = {
    padding: '1rem',
    borderRadius: '8px',
    marginTop: '1rem',
    backgroundColor: submitResult?.success ? `${theme.status.success}22` : `${theme.status.error}22`,
    color: submitResult?.success ? theme.status.success : theme.status.error,
  };

  if (submitResult?.success) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#10003;</div>
          <h3 style={{ color: theme.status.success, marginBottom: '1rem' }}>
            Credential Issued!
          </h3>
          <p style={{ color: theme.text.secondary, marginBottom: '1.5rem' }}>
            The credential has been issued to the holder.
          </p>
          {submitResult.txHash && (
            <div style={{
              padding: '1rem',
              backgroundColor: theme.background,
              borderRadius: '8px',
              marginBottom: '1.5rem',
            }}>
              <span style={{ ...labelStyles(theme), marginBottom: '0.25rem' }}>
                Transaction Hash
              </span>
              <code style={{ color: theme.text.primary, fontSize: '0.8rem' }}>
                {submitResult.txHash}
              </code>
            </div>
          )}
          <button
            style={primaryButtonStyles(theme)}
            onClick={() => {
              setSubmitResult(null);
              setHolderDid('');
              setClaims({});
            }}
          >
            Issue Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>Issue Credential</h2>
        <span style={{
          fontSize: '0.8rem',
          color: theme.text.muted,
          padding: '0.25rem 0.75rem',
          backgroundColor: theme.background,
          borderRadius: '4px',
        }}>
          {fullConfig.ORG_NAME}
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Holder DID */}
        <div style={formGroupStyle}>
          <label style={labelStyles(theme)}>Holder DID *</label>
          <input
            type="text"
            value={holderDid}
            onChange={(e) => setHolderDid(e.target.value)}
            placeholder="did:cardano:stake1..."
            required
            style={inputStyles(theme)}
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

        {/* Credential Type */}
        <div style={formGroupStyle}>
          <label style={labelStyles(theme)}>Credential Type *</label>
          <select
            value={credentialType}
            onChange={(e) => handleTypeChange(e.target.value as CredentialType)}
            style={selectStyle}
          >
            {fullConfig.CREDENTIAL_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Dynamic Claim Fields */}
        <div style={sectionTitleStyle}>Credential Claims</div>

        {currentFields.map(field => (
          <div key={field.key} style={formGroupStyle}>
            <label style={labelStyles(theme)}>
              {field.label} {field.required && '*'}
            </label>

            {field.type === 'select' ? (
              <select
                value={claims[field.key] as string || ''}
                onChange={(e) => handleClaimChange(field.key, e.target.value)}
                required={field.required}
                style={selectStyle}
              >
                <option value="">Select...</option>
                {field.options?.map(opt => (
                  <option key={opt} value={opt}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </select>
            ) : field.type === 'number' ? (
              <input
                type="number"
                value={claims[field.key] as number || ''}
                onChange={(e) => handleClaimChange(field.key, parseFloat(e.target.value) || 0)}
                required={field.required}
                style={inputStyles(theme)}
                min="0"
              />
            ) : (
              <input
                type="text"
                value={claims[field.key] as string || ''}
                onChange={(e) => handleClaimChange(field.key, e.target.value)}
                required={field.required}
                style={inputStyles(theme)}
              />
            )}

            <label style={checkboxContainerStyle}>
              <input
                type="checkbox"
                checked={disclosableClaims.has(field.key)}
                onChange={() => toggleDisclosable(field.key)}
                style={{ accentColor: theme.primary }}
              />
              Holder can hide this claim (disclosable)
            </label>
          </div>
        ))}

        {submitResult && !submitResult.success && (
          <div style={resultStyle}>{submitResult.message}</div>
        )}

        <div style={actionsStyle}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={secondaryButtonStyles(theme)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            style={{
              ...primaryButtonStyles(theme),
              opacity: isSubmitting ? 0.7 : 1,
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Issuing...' : 'Issue Credential'}
          </button>
        </div>
      </form>
    </div>
  );
}
