import React, { useState } from 'react';
import type { VCInterfaceConfig } from '@/config/org-config';
import { defaultConfig } from '@/config/org-config';
import {
  getTheme,
  cardStyles,
  primaryButtonStyles,
  secondaryButtonStyles,
  inputStyles,
  labelStyles,
  truncateDid,
  formatDate,
} from '@/styles';
import { StatusBadge } from './shared/StatusBadge';

export interface VerifierViewProps {
  config?: Partial<VCInterfaceConfig>;
}

/** Mock verification result structure */
interface VerificationResult {
  valid: boolean;
  credential: {
    type: string;
    issuerDid: string;
    holderDid: string;
    issuedAt: string;
    claims: Array<{ key: string; value: string | number | boolean }>;
  };
  issuerDid: {
    resolved: boolean;
    status: 'active' | 'revoked' | 'not_found';
    document?: {
      id: string;
      verificationMethod: string;
      vcIndexerEndpoint?: string;
    };
  };
  vcStatus: {
    checked: boolean;
    status: 'active' | 'revoked' | 'not_found';
    txHash?: string;
  };
  checks: Array<{
    name: string;
    passed: boolean;
    details: string;
  }>;
}

/**
 * VerifierView Component
 *
 * Allows third parties to verify credentials presented to them.
 * Implements the Verifier Discovery Flow from spec §2.2:
 * 1. Receive credential from holder
 * 2. Extract issuerDid from credential
 * 3. Resolve issuer's DID Document (via global DID Indexer)
 * 4. Find service with type "VCIndexer"
 * 5. Query that indexer's /vc/:vcHash/status endpoint
 */
export function VerifierView({ config }: VerifierViewProps) {
  const fullConfig = { ...defaultConfig, ...config };
  const theme = getTheme(fullConfig.THEME);

  const [credentialInput, setCredentialInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setIsVerifying(true);
    setError(null);
    setResult(null);

    try {
      // Simulate verification delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Mock verification result - in real implementation this would:
      // 1. Parse the credential/presentation
      // 2. Call DID Indexer to resolve issuer DID
      // 3. Find VCIndexer service endpoint
      // 4. Query VC status
      // 5. Verify signatures

      const mockResult: VerificationResult = {
        valid: true,
        credential: {
          type: 'ContributionCredential',
          issuerDid: 'did:cardano:stake1ux7l5d9y4q3z8k2j0n5m4p6w9v8c3b1a0t2s7r6e5d4f3g2h1',
          holderDid: 'did:cardano:stake1uq9l3d7y2q1z6k0j8n3m2p4w7v6c1b9a8t0s5r4e3d2f1g0h9',
          issuedAt: '2024-12-01T10:00:00Z',
          claims: [
            { key: 'projectId', value: 'catalyst-fund-14' },
            { key: 'contributionType', value: 'code' },
            { key: 'organization', value: 'Prisma' },
          ],
        },
        issuerDid: {
          resolved: true,
          status: 'active',
          document: {
            id: 'did:cardano:stake1ux7l5d9y4q3z8k2j0n5m4p6w9v8c3b1a0t2s7r6e5d4f3g2h1',
            verificationMethod: 'Ed25519VerificationKey2020',
            vcIndexerEndpoint: fullConfig.INDEXER_ENDPOINT,
          },
        },
        vcStatus: {
          checked: true,
          status: 'active',
          txHash: 'abc123def456789...',
        },
        checks: [
          { name: 'Credential Format', passed: true, details: 'Valid SD-JWT structure' },
          { name: 'Issuer DID Resolution', passed: true, details: 'DID resolved via global DID Indexer' },
          { name: 'Issuer DID Status', passed: true, details: 'Issuer DID is active (not revoked)' },
          { name: 'Signature Verification', passed: true, details: 'Ed25519 signature valid' },
          { name: 'VC Indexer Discovery', passed: true, details: `Found VCIndexer service at ${fullConfig.INDEXER_ENDPOINT}` },
          { name: 'Credential Status', passed: true, details: 'Credential is active (not revoked)' },
        ],
      };

      setResult(mockResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  // Styles
  const containerStyle: React.CSSProperties = {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '1rem',
  };

  const headerStyle: React.CSSProperties = {
    marginBottom: '2rem',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '1.75rem',
    fontWeight: 600,
    color: theme.text.primary,
    marginBottom: '0.5rem',
  };

  const subtitleStyle: React.CSSProperties = {
    color: theme.text.secondary,
    fontSize: '0.95rem',
  };

  const inputSectionStyle: React.CSSProperties = {
    ...cardStyles(theme),
    marginBottom: '1.5rem',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyles(theme),
    minHeight: '150px',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    resize: 'vertical' as const,
  };

  const resultCardStyle: React.CSSProperties = {
    ...cardStyles(theme),
    marginBottom: '1rem',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 600,
    color: theme.text.primary,
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  const checkItemStyle = (passed: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.75rem',
    backgroundColor: passed ? `${theme.status.success}11` : `${theme.status.error}11`,
    borderRadius: '6px',
    marginBottom: '0.5rem',
    borderLeft: `3px solid ${passed ? theme.status.success : theme.status.error}`,
  });

  const checkIconStyle = (passed: boolean): React.CSSProperties => ({
    color: passed ? theme.status.success : theme.status.error,
    fontWeight: 'bold',
    fontSize: '1rem',
  });

  const detailRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    borderBottom: `1px solid ${theme.text.muted}22`,
    fontSize: '0.9rem',
  };

  const flowStepStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    backgroundColor: theme.background,
    borderRadius: '6px',
    marginBottom: '0.5rem',
  };

  const stepNumberStyle: React.CSSProperties = {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: theme.primary,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 600,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Verify Credential</h1>
        <p style={subtitleStyle}>
          Paste a credential or presentation to verify its authenticity and check revocation status
        </p>
      </div>

      {/* Input Section */}
      <div style={inputSectionStyle}>
        <label style={labelStyles(theme)}>Credential / Presentation (SD-JWT or JSON)</label>
        <textarea
          value={credentialInput}
          onChange={(e) => setCredentialInput(e.target.value)}
          placeholder={`Paste the credential here...\n\nExample SD-JWT format:\neyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJkaWQ6Y2FyZGFubzpzdGFrZTF1Li4uIn0.signature~disclosure1~disclosure2`}
          style={textareaStyle}
        />
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleVerify}
            disabled={isVerifying || !credentialInput.trim()}
            style={{
              ...primaryButtonStyles(theme),
              opacity: isVerifying || !credentialInput.trim() ? 0.5 : 1,
            }}
          >
            {isVerifying ? 'Verifying...' : 'Verify Credential'}
          </button>
          <button
            onClick={() => {
              setCredentialInput('');
              setResult(null);
              setError(null);
            }}
            style={secondaryButtonStyles(theme)}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Verification Flow Explanation */}
      {!result && !error && (
        <div style={resultCardStyle}>
          <h3 style={sectionTitleStyle}>Verification Flow (per spec §2.2)</h3>
          <div style={flowStepStyle}>
            <span style={stepNumberStyle}>1</span>
            <span style={{ color: theme.text.secondary }}>Parse credential and extract issuer DID</span>
          </div>
          <div style={flowStepStyle}>
            <span style={stepNumberStyle}>2</span>
            <span style={{ color: theme.text.secondary }}>Resolve issuer DID via global DID Indexer</span>
          </div>
          <div style={flowStepStyle}>
            <span style={stepNumberStyle}>3</span>
            <span style={{ color: theme.text.secondary }}>Find VCIndexer service in DID Document</span>
          </div>
          <div style={flowStepStyle}>
            <span style={stepNumberStyle}>4</span>
            <span style={{ color: theme.text.secondary }}>Query VC status from org's VC Indexer</span>
          </div>
          <div style={flowStepStyle}>
            <span style={stepNumberStyle}>5</span>
            <span style={{ color: theme.text.secondary }}>Verify cryptographic signature</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={{
          ...resultCardStyle,
          backgroundColor: `${theme.status.error}11`,
          borderColor: theme.status.error,
        }}>
          <h3 style={{ ...sectionTitleStyle, color: theme.status.error }}>
            Verification Failed
          </h3>
          <p style={{ color: theme.text.secondary }}>{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <>
          {/* Overall Result */}
          <div style={{
            ...resultCardStyle,
            backgroundColor: result.valid ? `${theme.status.success}11` : `${theme.status.error}11`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{
                fontSize: '2.5rem',
              }}>
                {result.valid ? '✓' : '✗'}
              </span>
              <div>
                <h2 style={{
                  color: result.valid ? theme.status.success : theme.status.error,
                  fontSize: '1.5rem',
                  marginBottom: '0.25rem',
                }}>
                  {result.valid ? 'Credential Valid' : 'Credential Invalid'}
                </h2>
                <p style={{ color: theme.text.secondary }}>
                  {result.valid
                    ? 'All verification checks passed'
                    : 'One or more verification checks failed'}
                </p>
              </div>
            </div>
          </div>

          {/* Verification Checks */}
          <div style={resultCardStyle}>
            <h3 style={sectionTitleStyle}>Verification Checks</h3>
            {result.checks.map((check, i) => (
              <div key={i} style={checkItemStyle(check.passed)}>
                <span style={checkIconStyle(check.passed)}>
                  {check.passed ? '✓' : '✗'}
                </span>
                <div>
                  <div style={{ color: theme.text.primary, fontWeight: 500 }}>
                    {check.name}
                  </div>
                  <div style={{ color: theme.text.secondary, fontSize: '0.85rem' }}>
                    {check.details}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Credential Details */}
          <div style={resultCardStyle}>
            <h3 style={sectionTitleStyle}>
              Credential Details
              <StatusBadge status={result.vcStatus.status} theme={fullConfig.THEME} />
            </h3>
            <div style={detailRowStyle}>
              <span style={{ color: theme.text.muted }}>Type</span>
              <span style={{ color: theme.text.primary, fontWeight: 500 }}>
                {result.credential.type}
              </span>
            </div>
            <div style={detailRowStyle}>
              <span style={{ color: theme.text.muted }}>Issuer DID</span>
              <span style={{ color: theme.text.secondary, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                {truncateDid(result.credential.issuerDid, 16)}
              </span>
            </div>
            <div style={detailRowStyle}>
              <span style={{ color: theme.text.muted }}>Holder DID</span>
              <span style={{ color: theme.text.secondary, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                {truncateDid(result.credential.holderDid, 16)}
              </span>
            </div>
            <div style={detailRowStyle}>
              <span style={{ color: theme.text.muted }}>Issued</span>
              <span style={{ color: theme.text.secondary }}>
                {formatDate(result.credential.issuedAt)}
              </span>
            </div>

            <h4 style={{ ...sectionTitleStyle, marginTop: '1.5rem', fontSize: '0.9rem' }}>
              Disclosed Claims
            </h4>
            {result.credential.claims.map((claim, i) => (
              <div key={i} style={detailRowStyle}>
                <span style={{ color: theme.text.muted, textTransform: 'capitalize' }}>
                  {claim.key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span style={{ color: theme.text.primary }}>
                  {String(claim.value)}
                </span>
              </div>
            ))}
          </div>

          {/* Issuer DID Document */}
          <div style={resultCardStyle}>
            <h3 style={sectionTitleStyle}>
              Issuer DID Document
              <StatusBadge status={result.issuerDid.status} theme={fullConfig.THEME} />
            </h3>
            <div style={detailRowStyle}>
              <span style={{ color: theme.text.muted }}>DID</span>
              <span style={{ color: theme.text.secondary, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                {truncateDid(result.issuerDid.document?.id || '', 16)}
              </span>
            </div>
            <div style={detailRowStyle}>
              <span style={{ color: theme.text.muted }}>Verification Method</span>
              <span style={{ color: theme.text.secondary }}>
                {result.issuerDid.document?.verificationMethod}
              </span>
            </div>
            <div style={detailRowStyle}>
              <span style={{ color: theme.text.muted }}>VCIndexer Endpoint</span>
              <span style={{ color: theme.primary, fontSize: '0.85rem' }}>
                {result.issuerDid.document?.vcIndexerEndpoint}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
