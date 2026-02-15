'use client';

import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '../lib/cn';

export interface NavLink {
  href: string;
  label: string;
  active?: boolean;
}

export interface NavbarProps {
  /** Logo / brand area (left side) */
  brand: ReactNode;
  /** Navigation links */
  links: NavLink[];
  /** Right-side actions (network badge, language switcher, etc.) */
  actions?: ReactNode;
  /** Link renderer — allows using Next.js <Link> or plain <a> */
  renderLink?: (link: NavLink, className: string) => ReactNode;
  className?: string;
}

export function Navbar({ brand, links, actions, renderLink, className }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const linkClassName = (active: boolean) =>
    cn(
      'px-3 py-2 rounded-lg text-sm transition-colors',
      'focus-visible:ring-2 focus-visible:ring-primary outline-none',
      active
        ? 'text-primary bg-primary/10 font-medium'
        : 'text-text-secondary hover:text-text-primary hover:bg-surface',
    );

  const defaultRenderLink = (link: NavLink, cls: string) => (
    <a
      key={link.href}
      href={link.href}
      className={cls}
      aria-current={link.active ? 'page' : undefined}
    >
      {link.label}
    </a>
  );

  const renderer = renderLink ?? defaultRenderLink;

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        'sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-text-muted/20',
        className,
      )}
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3 font-semibold text-text-primary">
          {brand}
        </div>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {links.map((link) =>
            renderer(link, linkClassName(!!link.active)),
          )}
        </div>

        {/* Right side: actions + mobile toggle */}
        <div className="flex items-center gap-3">
          {actions}

          {/* Mobile menu button — only shown when there are links */}
          {links.length > 0 && (
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              className="md:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors focus-visible:ring-2 focus-visible:ring-primary outline-none"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border animate-fade-in">
          <div className="flex flex-col p-3 gap-1">
            {links.map((link) =>
              renderer(link, linkClassName(!!link.active)),
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
