import React from 'react';
import type { VCStatus } from '@/types/vc';
import type { ThemeConfig } from '@/config/org-config';
import { getTheme } from '@/styles';

export interface StatusBadgeProps {
  /** Current status of the credential */
  status: VCStatus;
  /** Optional theme override */
  theme?: Partial<ThemeConfig>;
  /** Optional additional className */
  className?: string;
}

/** Status badge labels */
const statusLabels: Record<VCStatus, string> = {
  active: 'Active',
  revoked: 'Revoked',
  pending: 'Pending',
};

/**
 * StatusBadge Component
 *
 * Displays the current status of a Verifiable Credential
 * with appropriate color coding.
 */
export function StatusBadge({ status, theme: themeOverride, className }: StatusBadgeProps) {
  const theme = getTheme(themeOverride);

  const statusColors: Record<VCStatus, string> = {
    active: theme.status.success,
    revoked: theme.status.error,
    pending: theme.status.warning,
  };

  const color = statusColors[status];
  const bgOpacity = '22'; // ~13% opacity

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
    backgroundColor: `${color}${bgOpacity}`,
    color: color,
  };

  return (
    <span style={style} className={className}>
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: color,
        }}
      />
      {statusLabels[status]}
    </span>
  );
}
