'use client';

import { Skeleton } from './skeleton';
import { Spinner } from './spinner';
import { cn } from '../lib/cn';

export interface LoadingStateProps {
  /** 'skeleton' renders placeholder shapes, 'spinner' renders a centered spinner */
  variant?: 'skeleton' | 'spinner';
  /** Number of skeleton lines to show */
  lines?: number;
  label?: string;
  className?: string;
}

export function LoadingState({
  variant = 'spinner',
  lines = 4,
  label = 'Loading...',
  className,
}: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <div aria-busy="true" aria-label={label} className={cn('space-y-3 p-4', className)}>
        <Skeleton className="h-5 w-1/3" />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={cn('flex flex-col items-center justify-center gap-3 p-8', className)}
    >
      <Spinner size="lg" label={label} />
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  );
}
