'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Calendar, ChevronRight, Loader2 } from 'lucide-react';
import type { Event } from '@/types/events';
import {
  compareEventsByStartAsc,
  formatEventCardSchedule,
  isValidIsoDateTime,
} from '@/lib/utils/eventScheduleDisplay';
import { cn } from '@/lib/utils';

export interface SocialFeedEventsRailProps {
  events: Event[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function SocialFeedEventsRail({
  events,
  loading,
  error,
  onRetry,
}: SocialFeedEventsRailProps) {
  const upcoming = useMemo(() => {
    const start = startOfToday().getTime();
    return events
      .filter(
        (e) =>
          e.status === 'published' &&
          !e.archived_at &&
          isValidIsoDateTime(e.start_time) &&
          new Date(e.start_time!).getTime() >= start
      )
      .sort(compareEventsByStartAsc)
      .slice(0, 16);
  }, [events]);

  if (loading) {
    return (
      <div className="border-b border-gray-100 bg-gradient-to-b from-gray-50/90 to-white px-4 py-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-primary" />
          Loading events…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-b border-gray-100 bg-gradient-to-b from-gray-50/90 to-white px-4 py-4">
        <p className="text-sm text-red-600">{error}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100 bg-gradient-to-b from-slate-50/95 to-white px-0 py-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <Calendar className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Upcoming events</p>
            <p className="truncate text-xs text-gray-500">Chapter calendar</p>
          </div>
        </div>
        <Link
          href="/dashboard/calendar"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'inline-flex h-9 shrink-0 items-center gap-1 rounded-full border-gray-200 px-3 text-xs font-medium text-brand-primary hover:bg-brand-primary/5'
          )}
        >
          View all
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <p className="px-4 text-sm text-gray-500">No upcoming events right now.</p>
      ) : (
        <div
          className={cn(
            'flex gap-3 overflow-x-auto px-4 pb-1',
            'snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          )}
        >
          {upcoming.map((event) => {
            const schedule = formatEventCardSchedule(event.start_time, event.end_time);
            const shortDate =
              isValidIsoDateTime(event.start_time) &&
              new Date(event.start_time!).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });

            return (
              <Link
                key={event.id}
                href="/dashboard/calendar"
                className={cn(
                  'snap-start shrink-0',
                  'w-[min(260px,calc(100vw-4.5rem))] rounded-xl border border-gray-200 bg-white p-3 shadow-sm',
                  'transition hover:border-brand-primary/30 hover:shadow-md active:scale-[0.99]'
                )}
              >
                <p className="line-clamp-2 text-sm font-medium leading-snug text-gray-900">
                  {event.title}
                </p>
                {shortDate && (
                  <p className="mt-1 text-xs font-medium text-brand-primary">{shortDate}</p>
                )}
                <p className="mt-0.5 text-xs text-gray-500">{schedule}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
