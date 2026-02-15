'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('text-center mb-6', className)}>
      <h1 className="text-3xl sm:text-4xl font-bold text-text-primary mb-2">
        {title}
      </h1>
      {subtitle && (
        <p className="text-base text-text-secondary max-w-xl mx-auto">
          {subtitle}
        </p>
      )}
      {actions && <div className="mt-4">{actions}</div>}
    </div>
  );
}
