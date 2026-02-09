'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { VCInterfaceConfig } from '@/config/org-config';
import { getTheme } from '@/styles';

interface NavigationProps {
  config: VCInterfaceConfig;
}

export function Navigation({ config }: NavigationProps) {
  const theme = getTheme(config.THEME);
  const pathname = usePathname();

  const navStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 2rem',
    height: '60px',
    backgroundColor: theme.surface,
    borderBottom: `1px solid ${theme.text.muted}33`,
  };

  const logoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: theme.text.primary,
    textDecoration: 'none',
  };

  const linksStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0.5rem',
  };

  const linkStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    fontSize: '0.9rem',
    color: isActive ? theme.primary : theme.text.secondary,
    backgroundColor: isActive ? `${theme.primary}15` : 'transparent',
    textDecoration: 'none',
    transition: 'all 0.15s',
  });

  const networkBadgeStyle: React.CSSProperties = {
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    backgroundColor: config.NETWORK === 'mainnet'
      ? `${theme.status.success}22`
      : `${theme.status.warning}22`,
    color: config.NETWORK === 'mainnet'
      ? theme.status.success
      : theme.status.warning,
  };

  return (
    <nav style={navStyle}>
      <Link href="/" style={logoStyle}>
        {config.ORG_NAME}
      </Link>

      <div style={linksStyle}>
        <Link href="/credentials" style={linkStyle(pathname === '/credentials')}>
          My Credentials
        </Link>
        <Link href="/issue" style={linkStyle(pathname === '/issue')}>
          Issue
        </Link>
        <Link href="/manage" style={linkStyle(pathname === '/manage')}>
          Manage
        </Link>
        <Link href="/verify" style={linkStyle(pathname === '/verify')}>
          Verify
        </Link>
      </div>

      <span style={networkBadgeStyle}>{config.NETWORK}</span>
    </nav>
  );
}
