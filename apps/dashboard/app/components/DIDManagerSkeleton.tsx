'use client';

import { Skeleton, Card } from '@prisma-dids/ui';

export function DIDManagerSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading DID status">
      {/* Tab bar skeleton */}
      <div className="flex gap-2 mb-4">
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>

      {/* Status content skeleton */}
      <div className="text-center">
        <Skeleton className="h-6 w-40 mx-auto mb-4" />

        <div className="text-left space-y-3 mb-4">
          {/* DID card */}
          <Card className="p-3">
            <Skeleton className="h-3 w-8 mb-2" />
            <Skeleton className="h-4 w-full" />
          </Card>

          {/* Status card */}
          <Card className="p-3 flex items-center justify-between">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </Card>

          {/* Version card */}
          <Card className="p-3 flex items-center justify-between">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-4 w-6" />
          </Card>

          {/* Last Action card */}
          <Card className="p-3 flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-14" />
          </Card>

          {/* IPFS CID card */}
          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-4 w-full" />
          </Card>
        </div>
      </div>
    </div>
  );
}
