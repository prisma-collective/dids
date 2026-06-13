'use client';

import { Skeleton, Card } from '@prisma-events/dids-ui';

export function DIDManagerSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading DID status" className="w-full">
      {/* Tab bar — mimics TabList with border-b */}
      <div className="flex gap-1 border-b border-border pb-px mb-4">
        <Skeleton className="h-[46px] w-20 rounded-t-md rounded-b-none" delay={0} />
        <Skeleton className="h-[46px] w-24 rounded-t-md rounded-b-none" delay={100} />
      </div>

      {/* Status heading */}
      <div className="mb-4">
        <Skeleton className="h-5 w-36 rounded" delay={150} />
      </div>

      {/* Status cards — mimics the real Card stack */}
      <div className="space-y-3">
        {/* DID card — label + long code */}
        <Card className="p-4 space-y-2">
          <Skeleton className="h-3 w-6 rounded" delay={200} />
          <Skeleton className="h-4 w-full rounded" delay={250} />
        </Card>

        {/* Status row — label + badge pill */}
        <Card className="p-4 flex items-center justify-between">
          <Skeleton className="h-3 w-12 rounded" delay={300} />
          <Skeleton className="h-5 w-16 rounded-full" delay={350} />
        </Card>

        {/* Version row */}
        <Card className="p-4 flex items-center justify-between">
          <Skeleton className="h-3 w-14 rounded" delay={400} />
          <Skeleton className="h-4 w-6 rounded" delay={450} />
        </Card>

        {/* Last Action row */}
        <Card className="p-4 flex items-center justify-between">
          <Skeleton className="h-3 w-20 rounded" delay={500} />
          <Skeleton className="h-4 w-14 rounded" delay={550} />
        </Card>

        {/* IPFS CID card — label + link + long code */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-16 rounded" delay={600} />
            <Skeleton className="h-3 w-10 rounded" delay={650} />
          </div>
          <Skeleton className="h-4 w-full rounded" delay={700} />
        </Card>

        {/* Last Tx card */}
        <Card className="p-4 flex items-center justify-between">
          <Skeleton className="h-3 w-14 rounded" delay={750} />
          <Skeleton className="h-4 w-44 rounded" delay={800} />
        </Card>
      </div>
    </div>
  );
}
