'use client';

import { defaultConfig } from '@/config/org-config';
import { getTheme, cardStyles } from '@/styles';
import Link from 'next/link';

export default function Home() {
  const theme = getTheme(defaultConfig.THEME);

  const containerStyle: React.CSSProperties = {
    maxWidth: '900px',
    margin: '0 auto',
    textAlign: 'center',
    padding: '3rem 1rem',
  };

  const heroStyle: React.CSSProperties = {
    marginBottom: '3rem',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '2.5rem',
    fontWeight: 700,
    color: theme.text.primary,
    marginBottom: '1rem',
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: '1.1rem',
    color: theme.text.secondary,
    maxWidth: '600px',
    margin: '0 auto 1.5rem',
  };

  const infoBoxStyle: React.CSSProperties = {
    ...cardStyles(theme),
    textAlign: 'left',
    marginBottom: '2rem',
    padding: '1.25rem',
    backgroundColor: `${theme.primary}11`,
    borderColor: `${theme.primary}33`,
  };

  const cardsContainerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginTop: '2rem',
  };

  const cardStyle: React.CSSProperties = {
    ...cardStyles(theme),
    textAlign: 'left',
    transition: 'transform 0.2s, border-color 0.2s',
    cursor: 'pointer',
  };

  const cardTitleStyle: React.CSSProperties = {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: theme.text.primary,
    marginBottom: '0.5rem',
  };

  const cardDescStyle: React.CSSProperties = {
    fontSize: '0.85rem',
    color: theme.text.secondary,
    lineHeight: 1.5,
  };

  const iconStyle: React.CSSProperties = {
    fontSize: '1.75rem',
    marginBottom: '0.75rem',
  };

  const roleTagStyle = (color: string): React.CSSProperties => ({
    display: 'inline-block',
    fontSize: '0.65rem',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    backgroundColor: `${color}22`,
    color: color,
    fontWeight: 600,
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
  });

  return (
    <div style={containerStyle}>
      <div style={heroStyle}>
        <h1 style={titleStyle}>{defaultConfig.ORG_NAME}</h1>
        <h2 style={{ ...titleStyle, fontSize: '1.5rem', fontWeight: 500, color: theme.text.secondary }}>
          Verifiable Credentials Interface
        </h2>
        <p style={subtitleStyle}>
          Issue, manage, share, and verify W3C Verifiable Credentials anchored on Cardano with SD-JWT selective disclosure
        </p>
      </div>

      {/* Architecture Info */}
      <div style={infoBoxStyle}>
        <div style={{ fontWeight: 600, color: theme.text.primary, marginBottom: '0.5rem' }}>
          How it works
        </div>
        <div style={{ color: theme.text.secondary, fontSize: '0.9rem', lineHeight: 1.6 }}>
          <strong>Prerequisites:</strong> Both issuer and holder must have a DID created via the{' '}
          <a href="https://prisma-dids.io" style={{ color: theme.primary }}>DID Dashboard</a>.
          <br />
          <strong>Flow:</strong> Issuer creates VC → Holder receives it → Holder selects claims to share → Verifier validates via this interface.
        </div>
      </div>

      <div style={cardsContainerStyle}>
        {/* Holder View */}
        <Link href="/credentials" style={{ textDecoration: 'none' }}>
          <div style={cardStyle}>
            <span style={roleTagStyle(theme.status.success)}>Holder</span>
            <div style={iconStyle}>📥</div>
            <h3 style={cardTitleStyle}>My Credentials</h3>
            <p style={cardDescStyle}>
              View credentials issued to you. Share with selective disclosure.
            </p>
          </div>
        </Link>

        {/* Issuer View - Issue */}
        <Link href="/issue" style={{ textDecoration: 'none' }}>
          <div style={cardStyle}>
            <span style={roleTagStyle(theme.primary)}>Issuer</span>
            <div style={iconStyle}>📝</div>
            <h3 style={cardTitleStyle}>Issue Credential</h3>
            <p style={cardDescStyle}>
              Create new credentials for holders. Requires authorized DID.
            </p>
          </div>
        </Link>

        {/* Issuer View - Manage */}
        <Link href="/manage" style={{ textDecoration: 'none' }}>
          <div style={cardStyle}>
            <span style={roleTagStyle(theme.primary)}>Issuer</span>
            <div style={iconStyle}>⚙️</div>
            <h3 style={cardTitleStyle}>Manage Issued</h3>
            <p style={cardDescStyle}>
              View and revoke credentials you have issued.
            </p>
          </div>
        </Link>

        {/* Verifier View */}
        <Link href="/verify" style={{ textDecoration: 'none' }}>
          <div style={cardStyle}>
            <span style={roleTagStyle(theme.status.warning)}>Verifier</span>
            <div style={iconStyle}>✓</div>
            <h3 style={cardTitleStyle}>Verify Credential</h3>
            <p style={cardDescStyle}>
              Verify a credential presented to you. Checks signatures and revocation.
            </p>
          </div>
        </Link>
      </div>

      {/* Footer Info */}
      <div style={{
        marginTop: '3rem',
        padding: '1rem',
        color: theme.text.muted,
        fontSize: '0.8rem',
        borderTop: `1px solid ${theme.text.muted}33`,
      }}>
        <p style={{ marginBottom: '0.5rem' }}>
          Powered by <strong>Prisma DIDs</strong> — Cardano-native DID infrastructure
        </p>
        <p>
          Network: <strong>{defaultConfig.NETWORK}</strong> |
          VC Indexer: <code style={{ fontSize: '0.75rem' }}>{defaultConfig.INDEXER_ENDPOINT}</code>
        </p>
      </div>
    </div>
  );
}
