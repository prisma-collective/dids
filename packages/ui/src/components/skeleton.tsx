'use client';

import { cn } from '../lib/cn';

export interface SkeletonProps {
  className?: string;
  /** Animation delay in ms for staggering multiple skeletons */
  delay?: number;
}

export function Skeleton({ className, delay }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg animate-shimmer',
        className,
      )}
      style={{
        backgroundImage:
          'linear-gradient(90deg, hsl(0 0% 100% / 0.05) 0%, hsl(0 0% 100% / 0.12) 50%, hsl(0 0% 100% / 0.05) 100%)',
        backgroundSize: '200% 100%',
        ...(delay ? { animationDelay: `${delay}ms` } : {}),
      }}
    />
  );
}
