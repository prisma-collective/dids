'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        aria-invalid={error || undefined}
        className={cn(
          'w-full px-3 py-2 rounded-lg text-sm',
          'bg-background border border-text-muted/40 text-text-primary placeholder:text-text-muted',
          'font-mono',
          'transition-colors duration-200',
          'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-error focus:border-error focus:ring-error',
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
