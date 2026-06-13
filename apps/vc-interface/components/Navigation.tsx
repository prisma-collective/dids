'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import type { VCInterfaceConfig } from '@/config/org-config';
import { cn, NetworkBadge, LanguageSwitcher } from '@prisma-events/dids-ui';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

interface NavigationProps {
  config: VCInterfaceConfig;
}

export function Navigation({ config }: NavigationProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const locale = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { href: '/credentials', label: t('myCredentials') },
    { href: '/issue', label: t('issue') },
    { href: '/manage', label: t('manage') },
    { href: '/verify', label: t('verify') },
  ];

  return (
    <nav
      className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-text-muted/20"
      role="navigation"
    >
      {/* Fixed-height bar — always 56px, never shifts */}
      <div className="h-14 max-w-[900px] mx-auto w-full flex items-center justify-between px-4">
        <Link href="/" className="flex-shrink-0 text-lg font-semibold text-text-primary no-underline hover:no-underline">
          {config.ORG_NAME}
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm no-underline transition-colors hover:no-underline',
                  isActive
                    ? 'text-primary bg-primary/10 font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <NetworkBadge network={config.NETWORK} />
          <LanguageSwitcher locale={locale} />

          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu — inside nav but outside the fixed bar */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border animate-fade-in">
          <div className="flex flex-col p-3 gap-1">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm no-underline transition-colors',
                    isActive
                      ? 'text-primary bg-primary/10 font-medium'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
