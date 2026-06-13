'use client';

import { Skeleton, Card } from '@prisma-events/dids-ui';

interface CredentialCardSkeletonProps {
  /** Base delay offset for staggering across multiple cards */
  baseDelay?: number;
}

export function CredentialCardSkeleton({ baseDelay = 0 }: CredentialCardSkeletonProps) {
  const d = (offset: number) => baseDelay + offset;

  return (
    <Card className="p-6">
      {/* Badge row — type pill + status pill */}
      <div className="flex justify-between items-start mb-3">
        <Skeleton className="h-5 w-28 rounded-full" delay={d(0)} />
        <Skeleton className="h-5 w-16 rounded-full" delay={d(50)} />
      </div>

      {/* Info rows — label: value pairs */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex gap-2 items-center">
          <Skeleton className="h-3.5 w-[60px] rounded" delay={d(100)} />
          <Skeleton className="h-3.5 w-40 rounded" delay={d(150)} />
        </div>
        <div className="flex gap-2 items-center">
          <Skeleton className="h-3.5 w-[60px] rounded" delay={d(200)} />
          <Skeleton className="h-3.5 w-24 rounded" delay={d(250)} />
        </div>
        <div className="flex gap-2 items-center">
          <Skeleton className="h-3.5 w-[60px] rounded" delay={d(300)} />
          <Skeleton className="h-3.5 w-16 rounded" delay={d(350)} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Skeleton className="h-[44px] w-24 rounded-lg" delay={d(400)} />
        <Skeleton className="h-[44px] w-16 rounded-lg" delay={d(450)} />
      </div>
    </Card>
  );
}
