'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import type { VCInterfaceConfig } from '@/config/org-config';
import { cn, NetworkBadge, LanguageSwitcher } from '@prisma-dids/ui';
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
    <nav className="flex items-center justify-between px-4 sm:px-8 h-[60px] bg-surface border-b border-border" role="navigation">
      <Link href="/" className="text-lg font-semibold text-text-primary no-underline hover:no-underline">
        {config.ORG_NAME}
      </Link>

      {/* Desktop nav */}
      <div className="hidden md:flex gap-1">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'px-4 py-2 rounded-md text-sm no-underline transition-colors hover:no-underline',
                isActive
                  ? 'text-primary bg-primary/10'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher locale={locale} />
        <NetworkBadge network={config.NETWORK} />

        {/* Mobile hamburger */}
        <button
          type="button"
          className="md:hidden p-2 text-text-secondary hover:text-text-primary"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="absolute top-[60px] left-0 right-0 bg-surface border-b border-border p-4 flex flex-col gap-1 md:hidden z-50 animate-fade-in">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'px-4 py-3 rounded-md text-sm no-underline transition-colors',
                  isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
