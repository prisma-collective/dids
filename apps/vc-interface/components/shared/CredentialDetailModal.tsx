import React from 'react';
import type { VerifiableCredential } from '@/types/vc';
import type { ThemeConfig } from '@/config/org-config';
import {
  getTheme,
  cardStyles,
  primaryButtonStyles,
  secondaryButtonStyles,
  truncateDid,
  formatDate,
} from '@/styles';
import { StatusBadge } from './StatusBadge';

export interface CredentialDetailModalProps {
  /** The credential to display */
  credential: VerifiableCredential;
  /** Called when modal is closed */
  onClose: () => void;
  /** Called when share is clicked (holder view) */
  onShare?: () => void;
  /** Optional theme override */
  theme?: Partial<ThemeConfig>;
  /** Network for explorer links */
  network?: 'preprod' | 'mainnet';
}

/**
 * CredentialDetailModal Component
 *
 * Shows full credential details including:
 * - All claims (disclosed)
 * - Issuer DID with link to DID Dashboard
 * - Transaction hash with link to explorer
 * - IPFS CID (if available)
 * - Status and timestamps
 */
export function CredentialDetailModal({
  credential,
  onClose,
  onShare,
  theme: themeOverride,
  network = 'preprod',
}: CredentialDetailModalProps) {
  const theme = getTheme(themeOverride);

  const explorerBaseUrl = network === 'mainnet'
    ? 'https://cardanoscan.io/transaction'
    : 'https://preprod.cardanoscan.io/transaction';

  const ipfsGateway = 'https://gateway.pinata.cloud/ipfs';

  // Styles
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  };

  const modalStyle: React.CSSProperties = {
    ...cardStyles(theme),
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
    gap: '1rem',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: theme.text.primary,
    margin: 0,
  };

  const closeButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: theme.text.muted,
    fontSize: '1.5rem',
    cursor: 'pointer',
    padding: '0.25rem',
    lineHeight: 1,
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '1.5rem',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.75rem',
  };

  const detailRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '0.625rem 0',
    borderBottom: `1px solid ${theme.text.muted}22`,
    gap: '1rem',
  };

  const labelStyle: React.CSSProperties = {
    color: theme.text.muted,
    fontSize: '0.875rem',
    flexShrink: 0,
  };

  const valueStyle: React.CSSProperties = {
    color: theme.text.primary,
    fontSize: '0.875rem',
    textAlign: 'right',
    wordBreak: 'break-word',
  };

  const monoValueStyle: React.CSSProperties = {
    ...valueStyle,
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: theme.text.secondary,
  };

  const linkStyle: React.CSSProperties = {
    color: theme.primary,
    textDecoration: 'none',
    fontSize: '0.8rem',
  };

  const claimRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.75rem',
    backgroundColor: theme.background,
    borderRadius: '6px',
    marginBottom: '0.5rem',
  };

  const badgeContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
  };

  const typeBadgeStyle: React.CSSProperties = {
    padding: '0.375rem 0.75rem',
    backgroundColor: `${theme.primary}22`,
    color: theme.primary,
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: 600,
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    marginTop: '1.5rem',
    paddingTop: '1rem',
    borderTop: `1px solid ${theme.text.muted}33`,
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div>
            <h2 style={titleStyle}>Credential Details</h2>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        {/* Type and Status */}
        <div style={badgeContainerStyle}>
          <span style={typeBadgeStyle}>{credential.type}</span>
          <StatusBadge status={credential.status} theme={themeOverride} />
        </div>

        {/* Basic Info */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Basic Information</div>
          <div style={detailRowStyle}>
            <span style={labelStyle}>Credential ID</span>
            <span style={monoValueStyle}>{credential.id}</span>
          </div>
          <div style={detailRowStyle}>
            <span style={labelStyle}>Issued</span>
            <span style={valueStyle}>{formatDate(credential.issuedAt)}</span>
          </div>
          {credential.expiresAt && (
            <div style={detailRowStyle}>
              <span style={labelStyle}>Expires</span>
              <span style={valueStyle}>{formatDate(credential.expiresAt)}</span>
            </div>
          )}
        </div>

        {/* Parties */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Parties</div>
          <div style={detailRowStyle}>
            <span style={labelStyle}>Issuer DID</span>
            <div style={{ textAlign: 'right' }}>
              <div style={monoValueStyle}>{truncateDid(credential.issuerDid, 16)}</div>
              <a
                href={`/did/${encodeURIComponent(credential.issuerDid)}`}
                style={linkStyle}
                target="_blank"
                rel="noopener noreferrer"
              >
                View in DID Dashboard →
              </a>
            </div>
          </div>
          <div style={detailRowStyle}>
            <span style={labelStyle}>Holder DID</span>
            <div style={{ textAlign: 'right' }}>
              <div style={monoValueStyle}>{truncateDid(credential.holderDid, 16)}</div>
            </div>
          </div>
        </div>

        {/* Claims */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Claims ({credential.claims.length})</div>
          {credential.claims.map((claim, i) => (
            <div key={i} style={claimRowStyle}>
              <span style={{ color: theme.text.secondary, textTransform: 'capitalize' }}>
                {claim.key.replace(/([A-Z])/g, ' $1').trim()}
                {!claim.disclosable && (
                  <span style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.65rem',
                    padding: '0.125rem 0.375rem',
                    backgroundColor: `${theme.status.warning}22`,
                    color: theme.status.warning,
                    borderRadius: '4px',
                  }}>
                    Always Visible
                  </span>
                )}
              </span>
              <span style={{ color: theme.text.primary, fontWeight: 500 }}>
                {String(claim.value)}
              </span>
            </div>
          ))}
        </div>

        {/* On-Chain References */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>On-Chain References</div>
          {credential.txHash ? (
            <div style={detailRowStyle}>
              <span style={labelStyle}>Transaction</span>
              <div style={{ textAlign: 'right' }}>
                <div style={monoValueStyle}>{credential.txHash.slice(0, 20)}...</div>
                <a
                  href={`${explorerBaseUrl}/${credential.txHash}`}
                  style={linkStyle}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on CardanoScan →
                </a>
              </div>
            </div>
          ) : (
            <div style={{ color: theme.text.muted, fontSize: '0.875rem' }}>
              Transaction hash not available (mock data)
            </div>
          )}
          {credential.ipfsCid && (
            <div style={detailRowStyle}>
              <span style={labelStyle}>IPFS CID</span>
              <div style={{ textAlign: 'right' }}>
                <div style={monoValueStyle}>{credential.ipfsCid.slice(0, 20)}...</div>
                <a
                  href={`${ipfsGateway}/${credential.ipfsCid}`}
                  style={linkStyle}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on IPFS →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={actionsStyle}>
          <button onClick={onClose} style={secondaryButtonStyles(theme)}>
            Close
          </button>
          {onShare && credential.status === 'active' && (
            <button onClick={onShare} style={primaryButtonStyles(theme)}>
              Share Credential
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
