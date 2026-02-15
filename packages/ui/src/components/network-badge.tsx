'use client';

import { cn } from '../lib/cn';

export interface NetworkBadgeProps {
  network: 'preprod' | 'mainnet';
  className?: string;
}

export function NetworkBadge({ network, className }: NetworkBadgeProps) {
  return (
    <span
      className={cn(
        'inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-wider',
        network === 'mainnet'
          ? 'bg-success/15 text-success'
          : 'bg-warning/15 text-warning',
        className,
      )}
    >
      {network}
    </span>
  );
}
