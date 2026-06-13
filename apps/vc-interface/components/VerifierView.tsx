'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { VCInterfaceConfig } from '@/config/org-config';
import { defaultConfig } from '@/config/org-config';
import { Button, Card, cn, truncateDid, formatDate } from '@prisma-events/dids-ui';
import { CheckCircle, XCircle, ShieldCheck, ShieldX, Search } from 'lucide-react';
import { StatusBadge } from './shared/StatusBadge';
import { verifyPresentation, fetchCredentialStatus } from '@/services/vcService';

export interface VerifierViewProps {
  config?: Partial<VCInterfaceConfig>;
  initialPresentation?: string;
}

/** Verification result structure from SDK + enrichment */
interface VerificationResult {
  valid: boolean;
  credential: {
    type: string;
    issuerDid: string;
    holderDid: string;
    issuedAt: string;
    claims: Array<{ key: string; value: string | number | boolean }>;
  };
  vcStatus: {
    checked: boolean;
    status: 'active' | 'revoked' | 'pending' | 'not_found';
  };
  checks: Array<{
    name: string;
    passed: boolean;
    details: string;
  }>;
}

export function VerifierView({ config, initialPresentation }: VerifierViewProps) {
  const fullConfig = { ...defaultConfig, ...config };
  const t = useTranslations('verifier');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [credentialInput, setCredentialInput] = useState(initialPresentation || '');
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-verify if an initial presentation was provided
  useEffect(() => {
    if (initialPresentation) handleVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async () => {
    const input = credentialInput.trim();
    if (!input) return;

    setIsVerifying(true);
    setError(null);
    setResult(null);

    try {
      // 1. Verify via server-side API route (COSE_Sign1 verification)
      const sdk = await verifyPresentation(input, fullConfig.INDEXER_ENDPOINT);

      if (!sdk.valid) {
        setError(sdk.error || t('verificationFailed'));
        return;
      }

      // 2. Check credential status on indexer if we have a jti
      let vcStatus: VerificationResult['vcStatus'] = {
        checked: false,
        status: 'not_found',
      };
      if (sdk.jti && fullConfig.INDEXER_ENDPOINT) {
        const status = await fetchCredentialStatus(sdk.jti, fullConfig.INDEXER_ENDPOINT);
        vcStatus = { checked: true, status };
      }

      // 3. Build verification checks list
      const checks: VerificationResult['checks'] = [
        { name: 'Credential Format', passed: true, details: 'Valid COSE-SD presentation' },
        { name: 'Signature Verification', passed: sdk.valid, details: sdk.valid ? 'COSE_Sign1 signature valid' : 'Signature invalid' },
      ];
      if (vcStatus.checked) {
        checks.push({
          name: 'Credential Status',
          passed: vcStatus.status === 'active',
          details: vcStatus.status === 'active'
            ? 'Credential is active (not revoked)'
            : vcStatus.status === 'revoked'
              ? 'Credential has been revoked'
              : 'Credential not found on-chain',
        });
      }

      // 4. Build claims array from the disclosed claims record
      const claims = Object.entries(sdk.claims).map(([key, value]) => ({
        key,
        value: value as string | number | boolean,
      }));

      setResult({
        valid: sdk.valid && vcStatus.status !== 'revoked',
        credential: {
          type: sdk.vct || 'Unknown',
          issuerDid: sdk.issuer,
          holderDid: sdk.holder,
          issuedAt: new Date().toISOString(),
          claims,
        },
        vcStatus,
        checks,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('verificationFailed'));
    } finally {
      setIsVerifying(false);
    }
  };

  const verificationSteps = [
    t('step1'),
    t('step2'),
    t('step3'),
    t('step4'),
    t('step5'),
  ];

  return (
    <div className="max-w-[800px] mx-auto p-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-text-primary mb-1">{t('title')}</h1>
        <p className="text-sm text-text-secondary">{t('subtitle')}</p>
      </div>

      {/* Input Section */}
      <Card className="p-5 mb-5">
        <label className="block text-sm text-text-secondary mb-1.5 font-medium">
          {t('inputLabel')}
        </label>
        <textarea
          value={credentialInput}
          onChange={(e) => setCredentialInput(e.target.value)}
          placeholder={t('inputPlaceholder')}
          className="w-full min-h-[100px] resize-y rounded-lg bg-background border border-border px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
        />
        <div className="flex gap-3 mt-4">
          <Button
            onClick={handleVerify}
            disabled={isVerifying || !credentialInput.trim()}
            loading={isVerifying}
          >
            {isVerifying ? t('verifying') : t('verifyButton')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setCredentialInput('');
              setResult(null);
              setError(null);
            }}
          >
            {tc('clear')}
          </Button>
        </div>
      </Card>

      {/* Verification Flow Explanation */}
      {!result && !error && (
        <Card className="p-5 mb-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Search className="h-4 w-4" />
            {t('flowTitle')}
          </h3>
          {verificationSteps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-2 bg-background rounded-md mb-1.5 last:mb-0"
            >
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-semibold">
                {i + 1}
              </span>
              <span className="text-sm text-text-secondary">{step}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Card className="p-6 mb-6 bg-error/10 border-error" role="alert">
          <h3 className="text-base font-semibold text-error mb-2">{t('verificationFailed')}</h3>
          <p className="text-text-secondary text-sm">{error}</p>
        </Card>
      )}

      {/* Result */}
      {result && (
        <>
          {/* Overall Result */}
          <Card className={cn(
            'p-6 mb-6',
            result.valid ? 'bg-success/10' : 'bg-error/10',
          )}>
            <div className="flex items-center gap-4">
              {result.valid ? (
                <ShieldCheck className="h-10 w-10 text-success flex-shrink-0" />
              ) : (
                <ShieldX className="h-10 w-10 text-error flex-shrink-0" />
              )}
              <div>
                <h2 className={cn(
                  'text-xl font-semibold mb-1',
                  result.valid ? 'text-success' : 'text-error',
                )}>
                  {result.valid ? t('credentialValid') : t('credentialInvalid')}
                </h2>
                <p className="text-text-secondary text-sm">
                  {result.valid ? t('allChecksPassed') : t('someChecksFailed')}
                </p>
              </div>
            </div>
          </Card>

          {/* Verification Checks */}
          <Card className="p-6 mb-6">
            <h3 className="text-base font-semibold text-text-primary mb-4">
              {t('verificationChecks')}
            </h3>
            {result.checks.map((check, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-md mb-2 last:mb-0 border-l-[3px]',
                  check.passed
                    ? 'bg-success/5 border-success'
                    : 'bg-error/5 border-error',
                )}
              >
                {check.passed ? (
                  <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-sm text-text-primary font-medium">{check.name}</div>
                  <div className="text-xs text-text-secondary mt-0.5">{check.details}</div>
                </div>
              </div>
            ))}
          </Card>

          {/* Credential Details */}
          <Card className="p-6 mb-6">
            <h3 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
              {t('credentialDetails')}
              <StatusBadge status={result.vcStatus.status} />
            </h3>
            <div className="flex justify-between py-2 border-b border-border/30 text-sm">
              <span className="text-text-muted">{tc('type')}</span>
              <span className="text-text-primary font-medium">{result.credential.type}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/30 text-sm">
              <span className="text-text-muted">{t('issuerDid')}</span>
              <span className="text-text-secondary font-mono text-xs">{truncateDid(result.credential.issuerDid, 16)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/30 text-sm">
              <span className="text-text-muted">{t('holderDid')}</span>
              <span className="text-text-secondary font-mono text-xs">{truncateDid(result.credential.holderDid, 16)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/30 text-sm">
              <span className="text-text-muted">{tc('issued')}</span>
              <span className="text-text-secondary">{formatDate(result.credential.issuedAt, locale)}</span>
            </div>

            <h4 className="text-sm font-semibold text-text-primary mt-6 mb-3">
              {t('disclosedClaims')}
            </h4>
            {result.credential.claims.map((claim, i) => (
              <div key={i} className="flex justify-between py-2 border-b border-border/30 text-sm last:border-0">
                <span className="text-text-muted capitalize">
                  {claim.key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className="text-text-primary">{String(claim.value)}</span>
              </div>
            ))}
          </Card>

          {/* Issuer Info */}
          <Card className="p-6 mb-6">
            <h3 className="text-base font-semibold text-text-primary mb-4">
              {t('issuerDidDocument')}
            </h3>
            <div className="flex justify-between py-2 border-b border-border/30 text-sm">
              <span className="text-text-muted">DID</span>
              <span className="text-text-secondary font-mono text-xs">{truncateDid(result.credential.issuerDid, 16)}</span>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <span className="text-text-muted">{t('vcIndexerEndpoint')}</span>
              <span className="text-primary text-xs">{fullConfig.INDEXER_ENDPOINT}</span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
