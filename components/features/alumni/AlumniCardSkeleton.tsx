import { Card, CardContent } from "@/components/ui/card";

export function AlumniCardSkeleton() {
  return (
    <Card className="bg-white border border-gray-200 rounded-lg overflow-hidden group h-[228px] sm:h-[400px] flex flex-col animate-pulse">
      <CardContent className="!p-0 flex flex-col h-full">
        {/* Header banner — desktop only (real alumni cards have no banner on mobile) */}
        <div className="hidden h-16 bg-gray-200 sm:block" />

        <div className="relative flex flex-1 flex-col px-2 pb-2 pt-2 sm:-mt-8 sm:px-4 sm:pb-4">
          {/* Avatar Skeleton */}
          <div className="flex justify-center mb-1.5 sm:mb-3">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-white bg-gray-200 shadow-sm sm:border-4" />
          </div>

          {/* Name and Activity Status Skeleton */}
          <div className="mb-1.5 space-y-1 text-center sm:mb-2 sm:space-y-2">
            <div className="mx-auto h-4 w-24 rounded bg-gray-200 sm:h-5" />
            <div className="mx-auto h-2.5 w-16 rounded bg-gray-200 sm:h-3" />
          </div>

          {/* Company and Job Title Skeleton */}
          <div className="mb-2 space-y-1 text-center sm:mb-3">
            <div className="mx-auto h-3 w-28 rounded bg-gray-200 sm:h-4 sm:w-32" />
            <div className="mx-auto h-2.5 w-24 rounded bg-gray-200 sm:h-3" />
          </div>

          {/* Location and Chapter Skeleton */}
          <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:mb-3">
            <div className="h-2.5 w-20 rounded bg-gray-200 sm:h-3" />
            <div className="h-2.5 w-24 rounded bg-gray-200 sm:h-3" />
          </div>

          {/* Skills/Tags Skeleton */}
          <div className="mb-2 flex flex-wrap items-center justify-center gap-1 sm:mb-3">
            <div className="h-4 w-16 rounded-full bg-gray-200 sm:h-5" />
            <div className="h-4 w-20 rounded-full bg-gray-200 sm:h-5" />
            <div className="hidden h-4 w-14 rounded-full bg-gray-200 sm:block sm:h-5" />
          </div>

          {/* Action Button Skeleton */}
          <div className="mt-auto flex h-9 items-center sm:h-10">
            <div className="h-8 w-full rounded-full bg-gray-200 sm:h-10" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AlumniCardSkeletonGrid({ count = 24 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1 sm:gap-2 md:gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <AlumniCardSkeleton key={`skeleton-${index}`} />
      ))}
    </div>
  );
}

