'use client';

import { useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Desktop sidebar: week calendar + events list (mock data for now).
 * Week runs Monday–Sunday (local timezone). Month view is a non-interactive placeholder.
 */

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

interface MockEvent {
  id: string;
  title: string;
  timeLabel: string;
  location: string;
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - daysFromMonday);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatWeekRangeFixed(weekStartMonday: Date): string {
  const end = addDays(weekStartMonday, 6);
  const sameYear = weekStartMonday.getFullYear() === end.getFullYear();
  if (sameYear) {
    const a = weekStartMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const b = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const y = weekStartMonday.getFullYear();
    return `${a} - ${b}, ${y}`;
  }
  return `${weekStartMonday.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Demo data aligned with design mock (April 2026 week containing Wed 1st) */
const MOCK_EVENTS_BY_DAY: Record<string, MockEvent[]> = {
  '2026-04-01': [
    { id: '1', title: 'Team Standup', timeLabel: '09:00 - 09:30', location: 'Conference Room A' },
    { id: '2', title: 'Product Review', timeLabel: '14:00 - 15:00', location: 'Zoom' },
  ],
};

const MOCK_EVENT_COUNT_BY_DAY: Record<string, number> = {
  '2026-04-01': 2,
  '2026-04-03': 1,
};

export interface CalendarEventsWeekCardProps {
  className?: string;
}

export function CalendarEventsWeekCard({ className }: CalendarEventsWeekCardProps) {
  // Initial week: the week of Wed Apr 1, 2026 (matches design reference)
  const [weekStartMonday, setWeekStartMonday] = useState(() =>
    startOfWeekMonday(new Date(2026, 3, 1))
  );
  const [selectedDate, setSelectedDate] = useState(() => new Date(2026, 3, 1));

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStartMonday, i)),
    [weekStartMonday]
  );

  const goPrevWeek = useCallback(() => {
    setWeekStartMonday((w) => addDays(w, -7));
  }, []);

  const goNextWeek = useCallback(() => {
    setWeekStartMonday((w) => addDays(w, 7));
  }, []);

  const selectedKey = dayKey(selectedDate);
  const listEvents = MOCK_EVENTS_BY_DAY[selectedKey] ?? [];

  return (
    <Card className={cn('bg-white shadow-sm border border-gray-200 overflow-hidden', className)}>
      <CardHeader className="p-5 pb-3 space-y-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-gray-900">{formatWeekRangeFixed(weekStartMonday)}</p>

          <div className="flex items-center justify-center gap-2">
            <div
              className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium"
              role="group"
              aria-label="Calendar view"
            >
              <span
                className="rounded-full px-3 py-1.5 text-gray-500 cursor-not-allowed select-none"
                title="Coming soon"
              >
                Month
              </span>
              <span className="rounded-full px-3 py-1.5 bg-brand-primary text-white shadow-sm">Week</span>
            </div>

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={goPrevWeek}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50 text-gray-700"
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goNextWeek}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50 text-gray-700"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 space-y-4">
        {/* Week strip */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekDays.map((day, i) => {
            const key = dayKey(day);
            const selected = isSameDay(day, selectedDate);
            const count = MOCK_EVENT_COUNT_BY_DAY[key] ?? 0;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(new Date(day.getFullYear(), day.getMonth(), day.getDate()))}
                className={cn(
                  'rounded-lg px-1 py-2 transition-colors min-h-[4.5rem] flex flex-col items-center justify-start border border-transparent',
                  selected && 'bg-orange-50 border-l-4 border-l-orange-400 border-orange-100 shadow-sm'
                )}
              >
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  {WEEKDAY_LABELS[i]}
                </span>
                <span
                  className={cn(
                    'text-sm font-semibold mt-0.5',
                    selected ? 'text-orange-700' : 'text-gray-900'
                  )}
                >
                  {day.getDate()}
                </span>
                <div className="mt-auto flex flex-col gap-0.5 w-full max-w-[28px] items-center pt-1">
                  {count > 0 &&
                    Array.from({ length: Math.min(count, 3) }).map((_, j) => (
                      <span key={j} className="h-1 w-full rounded-sm bg-accent-500" />
                    ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-gray-200" />

        {/* Events list */}
        <div>
          <div className="mb-3">
            <h3 className="text-base font-semibold text-gray-900">Events</h3>
            <p className="text-sm text-gray-500">{formatLongDate(selectedDate)}</p>
          </div>

          {listEvents.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No events on this day</p>
          ) : (
            <ul className="space-y-4">
              {listEvents.map((ev) => (
                <li key={ev.id} className="space-y-1.5">
                  <p className="text-sm font-semibold text-gray-900">{ev.title}</p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span>{ev.timeLabel}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span>{ev.location}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
