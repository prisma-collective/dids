import React from 'react';
import type { ThemeConfig } from '@/config/org-config';
import { getTheme } from '@/styles';

export interface ClaimCheckboxProps {
  /** The claim key/name */
  claimKey: string;
  /** The claim value */
  value: string | number | boolean;
  /** Whether this claim is currently selected */
  checked: boolean;
  /** Called when checkbox state changes */
  onChange: (checked: boolean) => void;
  /** Whether the checkbox is disabled */
  disabled?: boolean;
  /** Whether this claim is always visible (cannot be hidden) */
  alwaysVisible?: boolean;
  /** Optional theme override */
  theme?: Partial<ThemeConfig>;
}

/**
 * ClaimCheckbox Component
 *
 * Displays a single claim with a checkbox for selective disclosure.
 * Used in the SelectiveDisclosure page for holders to choose
 * which claims to reveal when sharing a credential.
 */
export function ClaimCheckbox({
  claimKey,
  value,
  checked,
  onChange,
  disabled = false,
  alwaysVisible = false,
  theme: themeOverride,
}: ClaimCheckboxProps) {
  const theme = getTheme(themeOverride);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.875rem 1rem',
    backgroundColor: checked ? `${theme.primary}11` : theme.background,
    borderRadius: '8px',
    border: `1px solid ${checked ? theme.primary : theme.text.muted}33`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s',
    opacity: disabled ? 0.6 : 1,
  };

  const checkboxStyle: React.CSSProperties = {
    width: '18px',
    height: '18px',
    accentColor: theme.primary,
    cursor: disabled ? 'not-allowed' : 'pointer',
    marginTop: '2px',
  };

  const labelStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  };

  const keyStyle: React.CSSProperties = {
    fontSize: '0.8rem',
    color: theme.text.secondary,
    fontWeight: 500,
    textTransform: 'capitalize',
  };

  const valueStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    color: theme.text.primary,
    wordBreak: 'break-word',
  };

  const badgeStyle: React.CSSProperties = {
    fontSize: '0.65rem',
    padding: '0.125rem 0.375rem',
    borderRadius: '4px',
    backgroundColor: `${theme.status.success}22`,
    color: theme.status.success,
    fontWeight: 600,
    marginLeft: '0.5rem',
  };

  const formatValue = (val: string | number | boolean): string => {
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  };

  const handleClick = () => {
    if (!disabled && !alwaysVisible) {
      onChange(!checked);
    }
  };

  return (
    <div
      style={containerStyle}
      onClick={handleClick}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled || alwaysVisible}
        style={checkboxStyle}
        onClick={(e) => e.stopPropagation()}
      />
      <div style={labelStyle}>
        <span style={keyStyle}>
          {claimKey.replace(/([A-Z])/g, ' $1').trim()}
          {alwaysVisible && <span style={badgeStyle}>Always Visible</span>}
        </span>
        <span style={valueStyle}>{formatValue(value)}</span>
      </div>
    </div>
  );
}
