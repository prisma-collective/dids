import React, { useState } from 'react';
import type { VerifiableCredential, RevocationReason, RevocationRequest } from '@/types/vc';
import type { VCInterfaceConfig } from '@/config/org-config';
import { defaultConfig } from '@/config/org-config';
import {
  getTheme,
  cardStyles,
  primaryButtonStyles,
  secondaryButtonStyles,
  dangerButtonStyles,
  inputStyles,
  labelStyles,
  truncateDid,
  formatDate,
} from '@/styles';
import { VCCard } from './shared/VCCard';
import { StatusBadge } from './shared/StatusBadge';

export interface RevocationUIProps {
  /** Organization configuration */
  config?: Partial<VCInterfaceConfig>;
  /** List of credentials issued by this issuer */
  issuedCredentials: VerifiableCredential[];
  /** Called when revoking a credential */
  onRevoke: (request: RevocationRequest) => Promise<void>;
  /** Issuer's DID */
  issuerDid?: string;
  /** Whether credentials are loading */
  isLoading?: boolean;
}

/** Revocation reason labels */
const reasonLabels: Record<RevocationReason, string> = {
  issued_in_error: 'Issued in Error',
  holder_request: 'Holder Request',
  policy_violation: 'Policy Violation',
  expired: 'Expired',
  other: 'Other',
};

/**
 * RevocationUI Component (Issuer View)
 *
 * Allows issuers to view and revoke credentials they have issued.
 * Features:
 * - List of issued credentials (active only for revocation)
 * - Revoke button on each credential
 * - Revocation modal with reason selection
 * - Confirmation before revocation
 */
export function RevocationUI({
  config,
  issuedCredentials,
  onRevoke,
  issuerDid,
  isLoading = false,
}: RevocationUIProps) {
  const fullConfig = { ...defaultConfig, ...config };
  const theme = getTheme(fullConfig.THEME);

  // Filter to only show active credentials (can't revoke already revoked)
  const activeCredentials = issuedCredentials.filter(c => c.status === 'active');
  const revokedCredentials = issuedCredentials.filter(c => c.status === 'revoked');

  const [selectedCredential, setSelectedCredential] = useState<VerifiableCredential | null>(null);
  const [revocationReason, setRevocationReason] = useState<RevocationReason>('issued_in_error');
  const [customReason, setCustomReason] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [revokeResult, setRevokeResult] = useState<{ success: boolean; txHash?: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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
      await onRevoke({
        credentialId: selectedCredential.id,
        reason: revocationReason,
        customReason: revocationReason === 'other' ? customReason : undefined,
      });
      setRevokeResult({ success: true, txHash: 'mock_revoke_tx_' + Date.now() });
    } catch (err) {
      console.error('Revocation failed:', err);
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

  // Styles
  const containerStyle: React.CSSProperties = {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '1rem',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
    gap: '1rem',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '1.75rem',
    fontWeight: 600,
    color: theme.text.primary,
    margin: 0,
  };

  const statsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '1.5rem',
    marginBottom: '1.5rem',
  };

  const statCardStyle: React.CSSProperties = {
    ...cardStyles(theme),
    padding: '1rem 1.5rem',
    flex: 1,
    textAlign: 'center',
  };

  const statNumberStyle: React.CSSProperties = {
    fontSize: '2rem',
    fontWeight: 700,
    color: theme.text.primary,
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: '0.8rem',
    color: theme.text.muted,
    textTransform: 'uppercase',
  };

  const toggleStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
  };

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 1rem',
    backgroundColor: active ? theme.primary : 'transparent',
    color: active ? '#fff' : theme.text.secondary,
    border: `1px solid ${active ? theme.primary : theme.text.muted}66`,
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
  });

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '1rem',
  };

  const emptyStateStyle: React.CSSProperties = {
    ...cardStyles(theme),
    textAlign: 'center',
    padding: '3rem 2rem',
  };

  const loadingStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem',
    gap: '1rem',
  };

  // Modal styles
  const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  };

  const modalStyle: React.CSSProperties = {
    ...cardStyles(theme),
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
  };

  const modalHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  };

  const modalTitleStyle: React.CSSProperties = {
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
  };

  const credentialSummaryStyle: React.CSSProperties = {
    backgroundColor: theme.background,
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1.5rem',
  };

  const formGroupStyle: React.CSSProperties = {
    marginBottom: '1.25rem',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyles(theme),
    cursor: 'pointer',
  };

  const warningBoxStyle: React.CSSProperties = {
    backgroundColor: `${theme.status.warning}22`,
    border: `1px solid ${theme.status.warning}`,
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1.5rem',
    color: theme.status.warning,
    fontSize: '0.9rem',
  };

  const modalActionsStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    marginTop: '1.5rem',
    paddingTop: '1rem',
    borderTop: `1px solid ${theme.text.muted}33`,
  };

  // Loading state
  if (isLoading) {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>
          <div style={{
            width: '40px',
            height: '40px',
            border: `3px solid ${theme.text.muted}33`,
            borderTopColor: theme.primary,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ color: theme.text.secondary }}>Loading issued credentials...</span>
        </div>
      </div>
    );
  }

  const displayedCredentials = showHistory ? revokedCredentials : activeCredentials;

  return (
    <div style={containerStyle}>
      <style>
        {`@keyframes spin { to { transform: rotate(360deg); } }`}
      </style>

      <div style={headerStyle}>
        <h2 style={titleStyle}>Issued Credentials</h2>
      </div>

      {/* Stats */}
      <div style={statsStyle}>
        <div style={statCardStyle}>
          <div style={{ ...statNumberStyle, color: theme.status.success }}>
            {activeCredentials.length}
          </div>
          <div style={statLabelStyle}>Active</div>
        </div>
        <div style={statCardStyle}>
          <div style={{ ...statNumberStyle, color: theme.status.error }}>
            {revokedCredentials.length}
          </div>
          <div style={statLabelStyle}>Revoked</div>
        </div>
        <div style={statCardStyle}>
          <div style={statNumberStyle}>{issuedCredentials.length}</div>
          <div style={statLabelStyle}>Total</div>
        </div>
      </div>

      {/* Toggle */}
      <div style={toggleStyle}>
        <button
          onClick={() => setShowHistory(false)}
          style={toggleBtnStyle(!showHistory)}
        >
          Active ({activeCredentials.length})
        </button>
        <button
          onClick={() => setShowHistory(true)}
          style={toggleBtnStyle(showHistory)}
        >
          Revoked ({revokedCredentials.length})
        </button>
      </div>

      {/* Credentials Grid */}
      {displayedCredentials.length === 0 ? (
        <div style={emptyStateStyle}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5 }}>
            {showHistory ? '📋' : '✅'}
          </div>
          <h3 style={{ color: theme.text.primary, marginBottom: '0.5rem' }}>
            {showHistory ? 'No revoked credentials' : 'No active credentials'}
          </h3>
          <p style={{ color: theme.text.secondary }}>
            {showHistory
              ? 'Revoked credentials will appear here.'
              : 'Issue credentials to see them here.'}
          </p>
        </div>
      ) : (
        <div style={gridStyle}>
          {displayedCredentials.map(credential => (
            <VCCard
              key={credential.id}
              credential={credential}
              onView={() => {}}
              onRevoke={() => handleRevokeClick(credential)}
              isIssuerView={true}
              theme={fullConfig.THEME}
            />
          ))}
        </div>
      )}

      {/* Revocation Modal */}
      {selectedCredential && (
        <div style={modalOverlayStyle} onClick={handleCloseModal}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={modalTitleStyle}>
                {revokeResult ? (revokeResult.success ? 'Credential Revoked' : 'Revocation Failed') : 'Revoke Credential'}
              </h3>
              <button onClick={handleCloseModal} style={closeButtonStyle}>×</button>
            </div>

            {/* Success State */}
            {revokeResult?.success ? (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
                <p style={{ color: theme.text.secondary, marginBottom: '1rem' }}>
                  The credential has been successfully revoked.
                </p>
                {revokeResult.txHash && (
                  <div style={{
                    padding: '0.75rem',
                    backgroundColor: theme.background,
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    color: theme.text.muted,
                  }}>
                    Tx: {revokeResult.txHash}
                  </div>
                )}
                <button
                  onClick={handleCloseModal}
                  style={{ ...primaryButtonStyles(theme), marginTop: '1.5rem' }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Credential Summary */}
                <div style={credentialSummaryStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: theme.text.muted, fontSize: '0.8rem' }}>Type</span>
                    <span style={{ color: theme.text.primary, fontWeight: 500 }}>
                      {selectedCredential.type}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: theme.text.muted, fontSize: '0.8rem' }}>Holder</span>
                    <span style={{ color: theme.text.secondary, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {truncateDid(selectedCredential.holderDid)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.text.muted, fontSize: '0.8rem' }}>Issued</span>
                    <span style={{ color: theme.text.secondary, fontSize: '0.85rem' }}>
                      {formatDate(selectedCredential.issuedAt)}
                    </span>
                  </div>
                </div>

                {!showConfirm ? (
                  <>
                    {/* Reason Selection */}
                    <div style={formGroupStyle}>
                      <label style={labelStyles(theme)}>Revocation Reason *</label>
                      <select
                        value={revocationReason}
                        onChange={(e) => setRevocationReason(e.target.value as RevocationReason)}
                        style={selectStyle}
                      >
                        {Object.entries(reasonLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>

                    {revocationReason === 'other' && (
                      <div style={formGroupStyle}>
                        <label style={labelStyles(theme)}>Custom Reason *</label>
                        <input
                          type="text"
                          value={customReason}
                          onChange={(e) => setCustomReason(e.target.value)}
                          placeholder="Enter reason for revocation..."
                          style={inputStyles(theme)}
                          required
                        />
                      </div>
                    )}

                    <div style={modalActionsStyle}>
                      <button onClick={handleCloseModal} style={secondaryButtonStyles(theme)}>
                        Cancel
                      </button>
                      <button
                        onClick={() => setShowConfirm(true)}
                        disabled={revocationReason === 'other' && !customReason.trim()}
                        style={{
                          ...dangerButtonStyles(theme),
                          opacity: revocationReason === 'other' && !customReason.trim() ? 0.5 : 1,
                        }}
                      >
                        Continue
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Confirmation */}
                    <div style={warningBoxStyle}>
                      <strong>⚠️ This action cannot be undone.</strong>
                      <br />
                      Once revoked, this credential will be permanently marked as invalid on the blockchain.
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <span style={{ color: theme.text.muted, fontSize: '0.8rem' }}>Reason:</span>
                      <span style={{ color: theme.text.primary, marginLeft: '0.5rem' }}>
                        {revocationReason === 'other' ? customReason : reasonLabels[revocationReason]}
                      </span>
                    </div>

                    <div style={modalActionsStyle}>
                      <button onClick={() => setShowConfirm(false)} style={secondaryButtonStyles(theme)}>
                        Back
                      </button>
                      <button
                        onClick={handleConfirmRevoke}
                        disabled={isRevoking}
                        style={{
                          ...dangerButtonStyles(theme),
                          opacity: isRevoking ? 0.7 : 1,
                        }}
                      >
                        {isRevoking ? 'Revoking...' : 'Confirm Revocation'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
