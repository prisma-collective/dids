'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface FooterProps {
  repoUrl?: string;
  network?: 'preprod' | 'mainnet';
  extra?: ReactNode;
  className?: string;
}

export function Footer({
  repoUrl = 'https://github.com/prisma-collective/Dids',
  network,
  extra,
  className,
}: FooterProps) {
  return (
    <footer
      className={cn(
        'text-center py-4 px-4 text-text-muted text-xs border-t border-text-muted/10 mt-auto',
        className,
      )}
    >
      <p>
        Powered by{' '}
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium"
        >
          Prisma DIDs
        </a>
        {' '}— Cardano-native DID infrastructure
        {network && (
          <span className="ml-2 text-text-muted">
            | <span className="uppercase font-medium">{network}</span>
          </span>
        )}
      </p>
      {extra}
    </footer>
  );
}
