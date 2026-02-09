import React from 'react';
import type { VerifiableCredential } from '@/types/vc';
import type { ThemeConfig } from '@/config/org-config';
import { getTheme, cardStyles, truncateDid, formatDate } from '@/styles';
import { StatusBadge } from './StatusBadge';

export interface VCCardProps {
  /** The credential to display */
  credential: VerifiableCredential;
  /** Called when "View Details" is clicked */
  onView?: (credential: VerifiableCredential) => void;
  /** Called when "Share" is clicked (holder view) */
  onShare?: (credential: VerifiableCredential) => void;
  /** Called when "Revoke" is clicked (issuer view) */
  onRevoke?: (credential: VerifiableCredential) => void;
  /** Whether to show issuer actions (revoke) vs holder actions (share) */
  isIssuerView?: boolean;
  /** Whether the card is in a compact mode */
  compact?: boolean;
  /** Optional theme override */
  theme?: Partial<ThemeConfig>;
}

/** Credential type display names */
const typeLabels: Record<string, string> = {
  ContributionCredential: 'Contribution',
  MembershipCredential: 'Membership',
  AchievementCredential: 'Achievement',
};

/**
 * VCCard Component
 *
 * Displays a Verifiable Credential card with:
 * - Credential type badge
 * - Issuer/Holder DID (truncated)
 * - Issue date
 * - Status badge
 * - Action buttons (View/Share/Revoke)
 *
 * Can be used in both issuer view (shows revoke) and holder view (shows share).
 */
export function VCCard({
  credential,
  onView,
  onShare,
  onRevoke,
  isIssuerView = false,
  compact = false,
  theme: themeOverride,
}: VCCardProps) {
  const theme = getTheme(themeOverride);
  const isRevoked = credential.status === 'revoked';

  const containerStyle: React.CSSProperties = {
    ...cardStyles(theme),
    padding: compact ? '1rem' : '1.5rem',
    opacity: isRevoked ? 0.7 : 1,
    position: 'relative',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: compact ? '0.75rem' : '1rem',
    gap: '0.75rem',
    flexWrap: 'wrap',
  };

  const typeBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.375rem 0.75rem',
    backgroundColor: `${theme.primary}22`,
    color: theme.primary,
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: 600,
  };

  const detailsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: compact ? '0.75rem' : '1rem',
  };

  const detailRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.875rem',
  };

  const labelStyle: React.CSSProperties = {
    color: theme.text.muted,
    minWidth: '60px',
  };

  const valueStyle: React.CSSProperties = {
    color: theme.text.secondary,
    fontFamily: 'monospace',
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  };

  const buttonBaseStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    border: 'none',
  };

  const viewButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    backgroundColor: theme.background,
    color: theme.text.primary,
    border: `1px solid ${theme.text.muted}66`,
  };

  const shareButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    backgroundColor: theme.primary,
    color: '#fff',
  };

  const revokeButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    backgroundColor: 'transparent',
    color: theme.status.error,
    border: `1px solid ${theme.status.error}`,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={typeBadgeStyle}>
          {typeLabels[credential.type] || credential.type}
        </span>
        <StatusBadge status={credential.status} theme={themeOverride} />
      </div>

      <div style={detailsStyle}>
        <div style={detailRowStyle}>
          <span style={labelStyle}>{isIssuerView ? 'Holder' : 'Issuer'}:</span>
          <span style={valueStyle}>
            {truncateDid(isIssuerView ? credential.holderDid : credential.issuerDid)}
          </span>
        </div>
        <div style={detailRowStyle}>
          <span style={labelStyle}>Issued:</span>
          <span style={{ color: theme.text.secondary }}>
            {formatDate(credential.issuedAt)}
          </span>
        </div>
        {!compact && credential.claims.length > 0 && (
          <div style={detailRowStyle}>
            <span style={labelStyle}>Claims:</span>
            <span style={{ color: theme.text.secondary }}>
              {credential.claims.length} fields
            </span>
          </div>
        )}
      </div>

      <div style={actionsStyle}>
        {onView && (
          <button style={viewButtonStyle} onClick={() => onView(credential)}>
            View Details
          </button>
        )}
        {!isIssuerView && onShare && !isRevoked && (
          <button style={shareButtonStyle} onClick={() => onShare(credential)}>
            Share
          </button>
        )}
        {isIssuerView && onRevoke && !isRevoked && (
          <button style={revokeButtonStyle} onClick={() => onRevoke(credential)}>
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}
