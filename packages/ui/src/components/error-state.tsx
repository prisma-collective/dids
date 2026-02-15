'use client';

import { AlertCircle } from 'lucide-react';
import { Button } from './button';
import { cn } from '../lib/cn';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({ message, onRetry, retryLabel = 'Retry', className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 p-6 text-center',
        className,
      )}
    >
      <AlertCircle className="h-10 w-10 text-error" />
      <p className="text-error text-sm">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
