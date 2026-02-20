'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';

/**
 * Theme configuration interface.
 * Mirrors apps/vc-interface/config/org-config.ts ThemeConfig exactly
 * so themes can be passed from org-config without cross-package imports.
 */
export interface ThemeConfig {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };
  status: {
    success: string;
    warning: string;
    error: string;
  };
}

/** Default theme (PRISMA purple) */
export const defaultTheme: ThemeConfig = {
  primary: '#8B5CF6',
  secondary: '#A855F7',
  background: '#000000',
  surface: '#111111',
  text: {
    primary: '#FFFFFF',
    secondary: '#A1A1AA',
    muted: '#71717A',
  },
  status: {
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
  },
};

const ThemeContext = createContext<ThemeConfig>(defaultTheme);

/**
 * Injects ThemeConfig values as CSS custom properties on :root.
 * These are consumed by Tailwind via the @theme block in globals.css:
 *   --color-primary: var(--theme-primary, fallback)
 */
export function ThemeProvider({
  theme,
  children,
}: {
  theme: ThemeConfig;
  children: ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', theme.primary);
    root.style.setProperty('--theme-secondary', theme.secondary);
    root.style.setProperty('--theme-background', theme.background);
    root.style.setProperty('--theme-surface', theme.surface);
    root.style.setProperty('--theme-text-primary', theme.text.primary);
    root.style.setProperty('--theme-text-secondary', theme.text.secondary);
    root.style.setProperty('--theme-text-muted', theme.text.muted);
    root.style.setProperty('--theme-success', theme.status.success);
    root.style.setProperty('--theme-warning', theme.status.warning);
    root.style.setProperty('--theme-error', theme.status.error);
    root.style.setProperty('--theme-border', `${theme.text.muted}33`);

    return () => {
      // Cleanup on unmount
      const props = [
        '--theme-primary', '--theme-secondary', '--theme-background',
        '--theme-surface', '--theme-text-primary', '--theme-text-secondary',
        '--theme-text-muted', '--theme-success', '--theme-warning',
        '--theme-error', '--theme-border',
      ];
      props.forEach((prop) => root.style.removeProperty(prop));
    };
  }, [theme]);

  return (
    <ThemeContext value={theme}>
      {children}
    </ThemeContext>
  );
}

/** Access the current theme config */
export function useTheme(): ThemeConfig {
  return useContext(ThemeContext);
}
