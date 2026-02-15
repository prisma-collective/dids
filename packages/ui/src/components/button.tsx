'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-primary text-white hover:opacity-90',
  secondary:
    'bg-transparent text-text-primary border border-text-muted/50 hover:border-text-secondary',
  danger:
    'bg-error text-white hover:opacity-90',
  ghost:
    'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface',
  link:
    'bg-transparent text-primary hover:underline p-0',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs min-h-[44px]',
  md: 'px-4 py-2 text-sm min-h-[44px]',
  lg: 'px-6 py-3 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantStyles[variant],
          variant !== 'link' && sizeStyles[size],
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
