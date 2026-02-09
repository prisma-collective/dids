import React, { useState } from 'react';
import type { VerifiableCredential, VCStatus } from '@/types/vc';
import type { VCInterfaceConfig } from '@/config/org-config';
import { defaultConfig } from '@/config/org-config';
import { getTheme, cardStyles } from '@/styles';
import { VCCard } from './shared/VCCard';

export interface CredentialInboxProps {
  /** Organization configuration */
  config?: Partial<VCInterfaceConfig>;
  /** List of credentials owned by the holder */
  credentials: VerifiableCredential[];
  /** Called when viewing credential details */
  onViewCredential?: (credential: VerifiableCredential) => void;
  /** Called when sharing a credential */
  onShareCredential?: (credential: VerifiableCredential) => void;
  /** Holder's DID for display */
  holderDid?: string;
  /** Whether credentials are loading */
  isLoading?: boolean;
  /** Wallet connection status */
  isWalletConnected?: boolean;
  /** Called when user wants to connect wallet */
  onConnectWallet?: () => void;
}

type FilterTab = 'all' | 'active' | 'revoked';

/**
 * CredentialInbox Component (Holder View)
 *
 * Displays all credentials held by the user.
 * Features:
 * - Filter tabs: All / Active / Revoked
 * - Credential cards grid
 * - View details / Share buttons
 * - Empty state
 */
export function CredentialInbox({
  config,
  credentials,
  onViewCredential,
  onShareCredential,
  holderDid,
  isLoading = false,
  isWalletConnected = true,
  onConnectWallet,
}: CredentialInboxProps) {
  const fullConfig = { ...defaultConfig, ...config };
  const theme = getTheme(fullConfig.THEME);

  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Filter credentials based on active tab
  const filteredCredentials = credentials.filter(cred => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return cred.status === 'active';
    if (activeTab === 'revoked') return cred.status === 'revoked';
    return true;
  });

  // Count for each tab
  const counts: Record<FilterTab, number> = {
    all: credentials.length,
    active: credentials.filter(c => c.status === 'active').length,
    revoked: credentials.filter(c => c.status === 'revoked').length,
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

  const walletStatusStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: theme.surface,
    borderRadius: '8px',
    fontSize: '0.875rem',
  };

  const tabsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0.25rem',
    marginBottom: '1.5rem',
    borderBottom: `1px solid ${theme.text.muted}33`,
    paddingBottom: '0',
  };

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '0.75rem 1.25rem',
    border: 'none',
    background: 'transparent',
    color: isActive ? theme.primary : theme.text.secondary,
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    borderBottom: `2px solid ${isActive ? theme.primary : 'transparent'}`,
    marginBottom: '-1px',
    transition: 'all 0.15s',
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

  const spinnerStyle: React.CSSProperties = {
    width: '40px',
    height: '40px',
    border: `3px solid ${theme.text.muted}33`,
    borderTopColor: theme.primary,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  };

  // Not connected state
  if (!isWalletConnected) {
    return (
      <div style={containerStyle}>
        <div style={emptyStateStyle}>
          <h3 style={{ color: theme.text.primary, marginBottom: '1rem' }}>
            Connect Your Wallet
          </h3>
          <p style={{ color: theme.text.secondary, marginBottom: '1.5rem' }}>
            Connect your Cardano wallet to view your credentials.
          </p>
          {onConnectWallet && (
            <button
              onClick={onConnectWallet}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: theme.primary,
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>
          <div style={spinnerStyle} />
          <span style={{ color: theme.text.secondary }}>Loading credentials...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <style>
        {`@keyframes spin { to { transform: rotate(360deg); } }`}
      </style>

      <div style={headerStyle}>
        <h2 style={titleStyle}>My Credentials</h2>
        {holderDid && (
          <div style={walletStatusStyle}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: theme.status.success,
              }}
            />
            <span style={{ color: theme.text.secondary }}>Connected</span>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={tabsStyle}>
        {(['all', 'active', 'revoked'] as FilterTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={tabStyle(activeTab === tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span
              style={{
                marginLeft: '0.5rem',
                padding: '0.125rem 0.5rem',
                backgroundColor: activeTab === tab
                  ? `${theme.primary}22`
                  : theme.background,
                borderRadius: '10px',
                fontSize: '0.75rem',
              }}
            >
              {counts[tab]}
            </span>
          </button>
        ))}
      </div>

      {/* Credentials Grid or Empty State */}
      {filteredCredentials.length === 0 ? (
        <div style={emptyStateStyle}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5 }}>
            📋
          </div>
          <h3 style={{ color: theme.text.primary, marginBottom: '0.5rem' }}>
            {activeTab === 'all'
              ? 'No credentials yet'
              : `No ${activeTab} credentials`}
          </h3>
          <p style={{ color: theme.text.secondary }}>
            {activeTab === 'all'
              ? 'Credentials issued to you will appear here.'
              : `You don't have any ${activeTab} credentials.`}
          </p>
        </div>
      ) : (
        <div style={gridStyle}>
          {filteredCredentials.map(credential => (
            <VCCard
              key={credential.id}
              credential={credential}
              onView={onViewCredential}
              onShare={onShareCredential}
              isIssuerView={false}
              theme={fullConfig.THEME}
            />
          ))}
        </div>
      )}
    </div>
  );
}
