'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface BadgeProps {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<string, string> = {
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  error: 'bg-error/15 text-error',
  info: 'bg-primary/15 text-primary',
  neutral: 'bg-text-muted/15 text-text-muted',
};

export function Badge({ variant = 'neutral', dot = false, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full',
        'text-xs font-semibold uppercase tracking-wide',
        variantStyles[variant],
        className,
      )}
    >
      {dot && (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}
