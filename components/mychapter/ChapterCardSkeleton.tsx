import { Card, CardContent } from "@/components/ui/card";

export function ChapterCardSkeleton() {
  return (
    <Card className="bg-white border border-gray-200 rounded-lg overflow-hidden group h-[228px] sm:h-[320px] flex flex-col animate-pulse">
      <CardContent className="!p-0 flex flex-col h-full">
        <div className="px-2 pt-1.5 pb-2 sm:px-4 sm:pt-4 sm:pb-4 relative flex-1 flex flex-col">
          {/* Avatar Skeleton */}
          <div className="flex justify-center mb-1.5 sm:mb-2">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-white bg-gray-200 shadow-sm sm:border-4" />
          </div>

          {/* Name Skeleton */}
          <div className="text-center mb-1.5 sm:mb-2 h-6 flex flex-col justify-center">
            <div className="h-3 sm:h-4 bg-gray-200 rounded w-24 mx-auto" />
          </div>

          {/* Position and Year Skeleton */}
          <div className="text-center mb-1.5 sm:mb-3 min-h-[18px] sm:min-h-[24px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
            {/* Mobile: Year badge skeleton */}
            <div className="sm:hidden h-4 bg-gray-200 rounded-full w-12" />
            
            {/* Desktop: Position and Year skeleton */}
            <div className="hidden sm:flex items-center justify-center gap-2">
              <div className="h-3 bg-gray-200 rounded w-16" />
              <div className="h-3 bg-gray-200 rounded w-1" />
              <div className="h-4 bg-gray-200 rounded-full w-12" />
            </div>

            {/* Mobile: Position skeleton */}
            <div className="sm:hidden h-3 bg-gray-200 rounded w-20" />
          </div>

          {/* Tags Section Skeleton (Desktop only) */}
          <div className="hidden sm:flex flex-wrap justify-center gap-1.5 mb-2 min-h-[20px]">
            <div className="h-4 bg-gray-200 rounded-full w-16" />
            <div className="h-4 bg-gray-200 rounded-full w-20" />
          </div>

          {/* Mutual Connections Skeleton */}
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-0.5 sm:space-y-0 sm:space-x-2 mb-2 sm:mb-4 flex-1 min-h-[28px] sm:min-h-[32px]">
            <div className="flex -space-x-1">
              <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 border-white bg-gray-200" />
              <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 border-white bg-gray-200" />
              <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 border-white bg-gray-200" />
            </div>
            <div className="h-3 sm:h-4 bg-gray-200 rounded w-20 sm:w-24" />
          </div>

          {/* Action Button Skeleton */}
          <div className="mt-auto h-9 sm:h-10 flex items-center">
            <div className="h-8 sm:h-10 bg-gray-200 rounded-full w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ChapterCardSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1 sm:gap-2 md:gap-3 items-start">
      {Array.from({ length: count }).map((_, index) => (
        <ChapterCardSkeleton key={`skeleton-${index}`} />
      ))}
    </div>
  );
}
