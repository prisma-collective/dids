'use client';

import { useCallback } from 'react';
import { cn } from '../lib/cn';

export interface LanguageSwitcherProps {
  locale: string;
  className?: string;
}

const locales = [
  { code: 'en', label: 'EN' },
  { code: 'pt-BR', label: 'PT' },
  { code: 'es', label: 'ES' },
] as const;

export function LanguageSwitcher({ locale, className }: LanguageSwitcherProps) {
  const switchLocale = useCallback((newLocale: string) => {
    document.cookie = `locale=${newLocale};path=/;max-age=31536000`;
    window.location.reload();
  }, []);

  return (
    <div className={cn('flex items-center text-xs', className)}>
      {locales.map(({ code, label }, i) => (
        <span key={code} className="flex items-center">
          {i > 0 && <span className="text-text-muted mx-1">|</span>}
          <button
            type="button"
            onClick={() => switchLocale(code)}
            aria-label={`Switch to ${label}`}
            className={cn(
              'relative px-1.5 py-2 rounded transition-colors',
              'focus-visible:ring-2 focus-visible:ring-primary outline-none',
              locale === code
                ? 'text-primary font-semibold'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            {label}
          </button>
        </span>
      ))}
    </div>
  );
}
