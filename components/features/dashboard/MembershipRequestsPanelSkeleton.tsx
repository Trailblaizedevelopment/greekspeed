'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const ROW_COUNT = 5;

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-md bg-gray-200 animate-pulse', className)}
      aria-hidden
    />
  );
}

export interface MembershipRequestsPanelSkeletonProps {
  className?: string;
  /** Optional bar above the card (governance multi-chapter summary). */
  showSummaryBar?: boolean;
}

/**
 * Layout placeholder while membership requests are loading — matches loaded card + table structure.
 */
export function MembershipRequestsPanelSkeleton({
  className,
  showSummaryBar = false,
}: MembershipRequestsPanelSkeletonProps) {
  return (
    <div
      className={cn('space-y-6', className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading membership requests</span>

      {showSummaryBar && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <SkeletonBar className="h-4 w-56 max-w-full" />
        </div>
      )}

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonBar className="h-7 w-52 max-w-[70%]" />
            <SkeletonBar className="h-5 w-28" />
          </div>
        </CardHeader>
        <CardContent>
          {/* Desktop: table-shaped skeleton */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-2 pr-4 text-left align-bottom" scope="col">
                    <SkeletonBar className="h-4 w-16" />
                  </th>
                  <th className="pb-2 pr-4 text-left align-bottom" scope="col">
                    <SkeletonBar className="h-4 w-14" />
                  </th>
                  <th className="pb-2 pr-4 text-left align-bottom" scope="col">
                    <SkeletonBar className="h-4 w-16" />
                  </th>
                  <th className="pb-2 pr-4 text-left align-bottom" scope="col">
                    <SkeletonBar className="h-4 w-24" />
                  </th>
                  <th className="pb-2 text-right align-bottom" scope="col">
                    <SkeletonBar className="h-4 w-16 ml-auto max-w-full" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: ROW_COUNT }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">
                      <SkeletonBar className="h-4 w-36 max-w-full" />
                    </td>
                    <td className="py-3 pr-4">
                      <SkeletonBar className="h-4 w-44 max-w-full" />
                    </td>
                    <td className="py-3 pr-4">
                      <SkeletonBar className="h-4 w-28 max-w-full" />
                    </td>
                    <td className="py-3 pr-4">
                      <SkeletonBar className="h-4 w-32" />
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className="flex justify-end items-center gap-2">
                        <SkeletonBar className="h-8 w-20 rounded-full" />
                        <SkeletonBar className="h-8 w-20 rounded-full" />
                        <SkeletonBar className="h-8 w-20 rounded-full" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked card skeletons */}
          <ul className="md:hidden space-y-3" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="rounded-lg border border-gray-200 bg-gray-50/80 overflow-hidden p-4 space-y-3"
              >
                <div className="flex justify-between gap-2">
                  <div className="space-y-2 flex-1 min-w-0">
                    <SkeletonBar className="h-5 w-40 max-w-full" />
                    <SkeletonBar className="h-4 w-full max-w-[220px]" />
                  </div>
                  <SkeletonBar className="h-5 w-5 shrink-0 rounded" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <SkeletonBar className="h-3 w-24" />
                  <SkeletonBar className="h-3 w-28" />
                </div>
                <SkeletonBar className="h-3 w-44" />
                <div className="flex gap-2 pt-1">
                  <SkeletonBar className="h-9 flex-1 rounded-md" />
                  <SkeletonBar className="h-9 flex-1 rounded-md" />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
