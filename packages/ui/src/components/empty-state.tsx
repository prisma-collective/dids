'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 p-8 text-center', className)}>
      {icon && <div className="text-text-muted">{icon}</div>}
      <h3 className="text-base font-medium text-text-primary">{title}</h3>
      {description && <p className="text-sm text-text-secondary max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
