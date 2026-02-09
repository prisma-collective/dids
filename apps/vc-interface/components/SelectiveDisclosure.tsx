import React, { useState, useMemo } from 'react';
import type { VerifiableCredential, VCClaim, PresentationData } from '@/types/vc';
import type { VCInterfaceConfig } from '@/config/org-config';
import { defaultConfig } from '@/config/org-config';
import {
  getTheme,
  cardStyles,
  primaryButtonStyles,
  secondaryButtonStyles,
  truncateDid,
  formatDate,
} from '@/styles';
import { StatusBadge } from './shared/StatusBadge';
import { ClaimCheckbox } from './shared/ClaimCheckbox';

export interface SelectiveDisclosureProps {
  /** Organization configuration */
  config?: Partial<VCInterfaceConfig>;
  /** The credential to share */
  credential: VerifiableCredential;
  /** Called when generating share link/presentation */
  onShare: (data: PresentationData) => Promise<string>;
  /** Called when user cancels */
  onCancel?: () => void;
  /** Called when going back to inbox */
  onBack?: () => void;
}

/**
 * SelectiveDisclosure Component (Holder View)
 *
 * Allows holder to select which claims to reveal when sharing a credential.
 * Features:
 * - Credential summary card
 * - Claims list with checkboxes
 * - Select All / Select None toggles
 * - Preview panel showing what verifier will see
 * - Generate share link / QR code
 */
export function SelectiveDisclosure({
  config,
  credential,
  onShare,
  onCancel,
  onBack,
}: SelectiveDisclosureProps) {
  const fullConfig = { ...defaultConfig, ...config };
  const theme = getTheme(fullConfig.THEME);

  // Track which claims are selected for disclosure
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(() => {
    // Initially select all disclosable claims
    return new Set(
      credential.claims
        .filter(c => c.disclosable)
        .map(c => c.key)
    );
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [shareResult, setShareResult] = useState<{ url: string } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Find which claims are always visible (not disclosable)
  const alwaysVisibleClaims = credential.claims.filter(c => !c.disclosable);
  const disclosableClaims = credential.claims.filter(c => c.disclosable);

  // Build preview of what verifier will see
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

  // Styles
  const containerStyle: React.CSSProperties = {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '1rem',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1.5rem',
  };

  const backButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: theme.text.secondary,
    cursor: 'pointer',
    fontSize: '1.25rem',
    padding: '0.5rem',
    display: 'flex',
    alignItems: 'center',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: theme.text.primary,
    margin: 0,
  };

  const summaryCardStyle: React.CSSProperties = {
    ...cardStyles(theme),
    marginBottom: '1.5rem',
  };

  const summaryHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  };

  const summaryDetailsStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '0.5rem 1rem',
    fontSize: '0.875rem',
  };

  const labelStyle: React.CSSProperties = {
    color: theme.text.muted,
  };

  const valueStyle: React.CSSProperties = {
    color: theme.text.secondary,
    fontFamily: 'monospace',
  };

  const sectionStyle: React.CSSProperties = {
    ...cardStyles(theme),
    marginBottom: '1.5rem',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 600,
    color: theme.text.primary,
    marginBottom: '1rem',
  };

  const togglesStyle: React.CSSProperties = {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1rem',
  };

  const toggleButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: theme.primary,
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: 0,
    textDecoration: 'underline',
  };

  const claimsListStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  };

  const previewContainerStyle: React.CSSProperties = {
    backgroundColor: theme.background,
    borderRadius: '8px',
    padding: '1rem',
    marginTop: '1rem',
  };

  const previewTitleStyle: React.CSSProperties = {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase',
    marginBottom: '0.75rem',
  };

  const previewClaimStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    borderBottom: `1px solid ${theme.text.muted}22`,
    fontSize: '0.875rem',
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    marginTop: '2rem',
  };

  const shareModalStyle: React.CSSProperties = {
    ...cardStyles(theme),
    textAlign: 'center',
    padding: '2rem',
  };

  const shareLinkStyle: React.CSSProperties = {
    padding: '1rem',
    backgroundColor: theme.background,
    borderRadius: '8px',
    marginTop: '1rem',
    wordBreak: 'break-all',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    color: theme.text.secondary,
  };

  // Share result modal
  if (shareResult) {
    return (
      <div style={containerStyle}>
        <div style={shareModalStyle}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
          <h3 style={{ color: theme.text.primary, marginBottom: '0.5rem' }}>
            Share Link Generated!
          </h3>
          <p style={{ color: theme.text.secondary, marginBottom: '1rem' }}>
            Anyone with this link can verify your credential.
          </p>

          <div style={shareLinkStyle}>
            {shareResult.url}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
            <button
              onClick={handleCopyLink}
              style={{
                ...primaryButtonStyles(theme),
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              {copySuccess ? '✓ Copied!' : 'Copy Link'}
            </button>
            <button
              onClick={() => setShareResult(null)}
              style={secondaryButtonStyles(theme)}
            >
              Edit Selection
            </button>
          </div>

          {onBack && (
            <button
              onClick={onBack}
              style={{
                ...secondaryButtonStyles(theme),
                marginTop: '1rem',
              }}
            >
              Back to Credentials
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        {onBack && (
          <button onClick={onBack} style={backButtonStyle}>
            ←
          </button>
        )}
        <h2 style={titleStyle}>Share Credential</h2>
      </div>

      {/* Credential Summary */}
      <div style={summaryCardStyle}>
        <div style={summaryHeaderStyle}>
          <span
            style={{
              padding: '0.375rem 0.75rem',
              backgroundColor: `${theme.primary}22`,
              color: theme.primary,
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            {credential.type}
          </span>
          <StatusBadge status={credential.status} theme={fullConfig.THEME} />
        </div>
        <div style={summaryDetailsStyle}>
          <span style={labelStyle}>Issuer:</span>
          <span style={valueStyle}>{truncateDid(credential.issuerDid)}</span>
          <span style={labelStyle}>Issued:</span>
          <span style={{ color: theme.text.secondary }}>{formatDate(credential.issuedAt)}</span>
        </div>
      </div>

      {/* Claims Selection */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={sectionTitleStyle}>Select Claims to Reveal</h3>
          <div style={togglesStyle}>
            <button onClick={handleSelectAll} style={toggleButtonStyle}>
              Select All
            </button>
            <span style={{ color: theme.text.muted }}>|</span>
            <button onClick={handleSelectNone} style={toggleButtonStyle}>
              Select None
            </button>
          </div>
        </div>

        <div style={claimsListStyle}>
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
              theme={fullConfig.THEME}
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
              theme={fullConfig.THEME}
            />
          ))}
        </div>

        {/* Preview */}
        <div style={previewContainerStyle}>
          <div style={previewTitleStyle}>Verifier Will See</div>
          {previewClaims.length === 0 ? (
            <p style={{ color: theme.text.muted, fontSize: '0.875rem' }}>
              Select at least one claim to share.
            </p>
          ) : (
            previewClaims.map(claim => (
              <div key={claim.key} style={previewClaimStyle}>
                <span style={{ color: theme.text.secondary }}>
                  {claim.key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span style={{ color: theme.text.primary, fontWeight: 500 }}>
                  {String(claim.value)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={actionsStyle}>
        {onCancel && (
          <button onClick={onCancel} style={secondaryButtonStyles(theme)}>
            Cancel
          </button>
        )}
        <button
          onClick={handleGenerateShare}
          disabled={isGenerating || previewClaims.length === 0}
          style={{
            ...primaryButtonStyles(theme),
            opacity: isGenerating || previewClaims.length === 0 ? 0.5 : 1,
          }}
        >
          {isGenerating ? 'Generating...' : 'Generate Share Link'}
        </button>
      </div>
    </div>
  );
}
