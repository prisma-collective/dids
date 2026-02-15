'use client';

import { Skeleton, Card } from '@prisma-dids/ui';

export function CredentialCardSkeleton() {
  return (
    <Card className="p-6">
      {/* Badge row */}
      <div className="flex justify-between items-start mb-3">
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>

      {/* Info rows */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex gap-2">
          <Skeleton className="h-4 w-[60px]" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-4 w-[60px]" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-4 w-[60px]" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-16 rounded-lg" />
      </div>
    </Card>
  );
}
