'use client';

import { Skeleton, Card } from '@prisma-dids/ui';

interface FormSkeletonProps {
  fields?: number;
}

export function FormSkeleton({ fields = 3 }: FormSkeletonProps) {
  return (
    <Card className="p-6" aria-busy="true" aria-label="Loading form">
      {/* Title */}
      <Skeleton className="h-6 w-48 mb-2" />
      {/* Description */}
      <Skeleton className="h-4 w-full max-w-md mb-6" />

      {/* Form fields */}
      <div className="space-y-4 mb-6">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-24 mb-1.5" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>

      {/* Submit button */}
      <Skeleton className="h-10 w-32 rounded-lg" />
    </Card>
  );
}
