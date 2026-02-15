'use client';

import { cn } from '../lib/cn';

export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-text-muted/15',
        className,
      )}
    />
  );
}
