'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ContainerProps {
  /** 'narrow' for forms/detail pages, 'wide' for dashboards/listings */
  size?: 'narrow' | 'default' | 'wide';
  children: ReactNode;
  className?: string;
}

const sizeStyles: Record<string, string> = {
  narrow: 'max-w-2xl',
  default: 'max-w-4xl',
  wide: 'max-w-6xl',
};

export function Container({ size = 'default', children, className }: ContainerProps) {
  return (
    <div className={cn('mx-auto px-4 sm:px-6 lg:px-8', sizeStyles[size], className)}>
      {children}
    </div>
  );
}
