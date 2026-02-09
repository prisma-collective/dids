/**
 * Style utilities for VC Interface components
 *
 * Uses inline styles for maximum portability.
 * Can be replaced with Tailwind classes when integrated into an app.
 */

import type { ThemeConfig } from './config/org-config';
import { defaultConfig } from './config/org-config';

/** Get theme from config or use defaults */
export function getTheme(theme?: Partial<ThemeConfig>): ThemeConfig {
  if (!theme) return defaultConfig.THEME;
  return {
    ...defaultConfig.THEME,
    ...theme,
    text: { ...defaultConfig.THEME.text, ...theme.text },
    status: { ...defaultConfig.THEME.status, ...theme.status },
  };
}

/** Common styles for cards/panels */
export function cardStyles(theme: ThemeConfig): React.CSSProperties {
  return {
    backgroundColor: theme.surface,
    borderRadius: '12px',
    padding: '1.5rem',
    border: `1px solid ${theme.text.muted}33`,
  };
}

/** Primary button styles */
export function primaryButtonStyles(theme: ThemeConfig): React.CSSProperties {
  return {
    backgroundColor: theme.primary,
    color: '#fff',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  };
}

/** Secondary button styles */
export function secondaryButtonStyles(theme: ThemeConfig): React.CSSProperties {
  return {
    backgroundColor: 'transparent',
    color: theme.text.primary,
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: `1px solid ${theme.text.muted}`,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  };
}

/** Danger button styles */
export function dangerButtonStyles(theme: ThemeConfig): React.CSSProperties {
  return {
    backgroundColor: theme.status.error,
    color: '#fff',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  };
}

/** Input field styles */
export function inputStyles(theme: ThemeConfig): React.CSSProperties {
  return {
    width: '100%',
    padding: '0.75rem 1rem',
    backgroundColor: theme.background,
    border: `1px solid ${theme.text.muted}66`,
    borderRadius: '8px',
    color: theme.text.primary,
    fontSize: '0.9rem',
    outline: 'none',
  };
}

/** Label styles */
export function labelStyles(theme: ThemeConfig): React.CSSProperties {
  return {
    display: 'block',
    fontSize: '0.875rem',
    color: theme.text.secondary,
    marginBottom: '0.5rem',
    fontWeight: 500,
  };
}

/** Truncate DID for display */
export function truncateDid(did: string, chars = 12): string {
  if (did.length <= chars * 2 + 3) return did;
  return `${did.slice(0, chars)}...${did.slice(-chars)}`;
}

/** Format date for display */
export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
