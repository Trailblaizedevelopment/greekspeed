'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  HelpCircle,
  MapPin,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Event } from '@/types/events';
import {
  compareEventsByStartAsc,
  formatEventCardSchedule,
  isPublishedEventUpcoming,
} from '@/lib/utils/eventScheduleDisplay';
import {
  countEventsStartingOnLocalDate,
  filterEventsStartingOnLocalDate,
} from '@/lib/utils/eventCalendar';
import { EventDetailModal } from '@/components/features/events/EventDetailModal';
import { EventActionsMenu } from '@/components/features/events/EventActionsMenu';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const EVENTS_PER_PAGE = 3;

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

function localToday(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

export interface CalendarEventsWeekCardProps {
  userId?: string | null;
  events: Event[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void | Promise<void>;
  className?: string;
}

function WeekCardEventRow({
  event,
  formatEventDateTime,
  rsvpStatuses,
  getRSVPButtonVariant,
  onOpen,
  onRSVP,
}: {
  event: Event;
  formatEventDateTime: (ev: Event) => string;
  rsvpStatuses: Record<string, 'attending' | 'maybe' | 'not_attending'>;
  getRSVPButtonVariant: (eventId: string, buttonStatus: string) => 'default' | 'outline';
  onOpen: (event: Event) => void;
  onRSVP: (eventId: string, status: 'attending' | 'maybe' | 'not_attending') => void;
}) {
  return (
    <div
      className="group relative p-3 border border-gray-200 rounded-lg hover:border-primary-300 hover:shadow-sm transition-all duration-200 bg-white cursor-pointer"
      onClick={() => onOpen(event)}
    >
      <div
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <EventActionsMenu event={event} hideOnMobile />
      </div>

      <h4 className="font-semibold text-gray-900 text-sm mb-2 break-words leading-tight pr-6">
        {event.title}
      </h4>

      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mb-2">
        <div className="flex items-center space-x-1.5">
          <Clock className="h-3.5 w-3.5 text-brand-primary flex-shrink-0" />
          <span className="break-words">{formatEventDateTime(event)}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <MapPin className="h-3.5 w-3.5 text-brand-primary flex-shrink-0" />
          <span className="break-words">{event.location || 'Location TBD'}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <Users className="h-3.5 w-3.5 text-brand-primary flex-shrink-0" />
          <span className="font-medium">{event.attendee_count || 0} going</span>
        </div>
      </div>

      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          variant={getRSVPButtonVariant(event.id, 'attending')}
          onClick={() => onRSVP(event.id, 'attending')}
          className={cn(
            'h-6 w-6 p-0 rounded-full text-xs font-medium transition-all',
            getRSVPButtonVariant(event.id, 'attending') === 'default'
              ? 'bg-brand-primary hover:bg-brand-primary-hover text-white'
              : 'hover:bg-green-50'
          )}
          title="Going"
        >
          <Users className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant={getRSVPButtonVariant(event.id, 'maybe')}
          onClick={() => onRSVP(event.id, 'maybe')}
          className={cn(
            'h-6 w-6 p-0 rounded-full text-xs font-medium transition-all',
            getRSVPButtonVariant(event.id, 'maybe') === 'default'
              ? 'bg-brand-primary hover:bg-brand-primary-hover text-white'
              : 'hover:bg-primary-50'
          )}
          title="Maybe"
        >
          <HelpCircle className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant={getRSVPButtonVariant(event.id, 'not_attending')}
          onClick={() => onRSVP(event.id, 'not_attending')}
          className={cn(
            'h-6 w-6 p-0 rounded-full text-xs font-medium transition-all',
            getRSVPButtonVariant(event.id, 'not_attending') === 'default'
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'hover:bg-red-50'
          )}
          title="Not Going"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function UpcomingPagination({
  currentPage,
  totalPages,
  onPrev,
  onNext,
  onPage,
}: {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="flex items-center justify-center w-full">
        <div className="flex items-center space-x-2 flex-wrap justify-center gap-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrev}
            disabled={currentPage === 1}
            className="h-8 px-3 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
            Previous
          </Button>
          <div className="flex items-center space-x-1 max-w-full overflow-x-auto">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={currentPage === page ? 'default' : 'outline'}
                size="sm"
                onClick={() => onPage(page)}
                className={cn(
                  'h-8 w-8 p-0 text-xs flex-shrink-0',
                  currentPage === page
                    ? 'bg-brand-primary text-white hover:bg-brand-primary-hover'
                    : 'hover:bg-gray-50'
                )}
              >
                {page}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onNext}
            disabled={currentPage === totalPages}
            className="h-8 px-3 text-xs"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CalendarEventsWeekCard({
  userId,
  events,
  loading = false,
  error = null,
  onRetry,
  className,
}: CalendarEventsWeekCardProps) {
  const [weekStartMonday, setWeekStartMonday] = useState(() => startOfWeekMonday(localToday()));
  const [selectedDate, setSelectedDate] = useState(localToday);
  const [rsvpStatuses, setRsvpStatuses] = useState<
    Record<string, 'attending' | 'maybe' | 'not_attending'>
  >({});
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const nowIso = useMemo(() => new Date().toISOString(), [events]);

  const dayEvents = useMemo(
    () => filterEventsStartingOnLocalDate(events, selectedDate),
    [events, selectedDate]
  );

  const upcomingDeduped = useMemo(() => {
    const dayIds = new Set(dayEvents.map((e) => e.id));
    return events
      .filter((e) => isPublishedEventUpcoming(e, nowIso))
      .filter((e) => !dayIds.has(e.id))
      .sort(compareEventsByStartAsc);
  }, [events, nowIso, dayEvents]);

  const upcomingTotalPages = Math.ceil(upcomingDeduped.length / EVENTS_PER_PAGE);
  const upcomingStart = (upcomingPage - 1) * EVENTS_PER_PAGE;
  const upcomingSlice = upcomingDeduped.slice(upcomingStart, upcomingStart + EVENTS_PER_PAGE);

  useEffect(() => {
    const next: Record<string, 'attending' | 'maybe' | 'not_attending'> = {};
    events.forEach((event) => {
      if (event.user_rsvp_status) {
        next[event.id] = event.user_rsvp_status;
      }
    });
    setRsvpStatuses(next);
  }, [events]);

  useEffect(() => {
    setUpcomingPage(1);
  }, [upcomingDeduped.length, selectedDate]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStartMonday, i)),
    [weekStartMonday]
  );

  useEffect(() => {
    const weekEnd = addDays(weekStartMonday, 6);
    const tSel = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate()
    ).getTime();
    const tStart = new Date(
      weekStartMonday.getFullYear(),
      weekStartMonday.getMonth(),
      weekStartMonday.getDate()
    ).getTime();
    const tEnd = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate()).getTime();
    if (tSel < tStart || tSel > tEnd) {
      setSelectedDate(
        new Date(weekStartMonday.getFullYear(), weekStartMonday.getMonth(), weekStartMonday.getDate())
      );
    }
  }, [weekStartMonday, selectedDate]);

  const goPrevWeek = useCallback(() => {
    setWeekStartMonday((w) => addDays(w, -7));
  }, []);

  const goNextWeek = useCallback(() => {
    setWeekStartMonday((w) => addDays(w, 7));
  }, []);

  const handleRSVP = useCallback(
    async (eventId: string, status: 'attending' | 'maybe' | 'not_attending') => {
      if (!userId) return;
      try {
        const response = await fetch(`/api/events/${eventId}/rsvp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, user_id: userId }),
        });
        if (response.ok) {
          setRsvpStatuses((prev) => ({ ...prev, [eventId]: status }));
          if (onRetry) await onRetry();
        } else {
          const errorData = await response.json();
          console.error('RSVP error:', errorData.error);
        }
      } catch (err) {
        console.error('Error submitting RSVP:', err);
      }
    },
    [userId, onRetry]
  );

  const getRSVPButtonVariant = useCallback(
    (eventId: string, buttonStatus: string) => {
      if (rsvpStatuses[eventId] === buttonStatus) return 'default' as const;
      return 'outline' as const;
    },
    [rsvpStatuses]
  );

  const formatEventDateTime = useCallback((ev: Event) => {
    return formatEventCardSchedule(ev.start_time, ev.end_time);
  }, []);

  const openEvent = useCallback((event: Event) => {
    setSelectedEvent(event);
    setShowDetailModal(true);
  }, []);

  const handleRetry = useCallback(() => {
    void onRetry?.();
  }, [onRetry]);

  if (loading) {
    return (
      <Card className={cn('bg-white shadow-sm border border-gray-200 overflow-hidden', className)}>
        <CardHeader className="p-5 pb-3">
          <CardTitlePlaceholder />
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary mb-2" />
            <p className="text-gray-500 text-sm">Loading events...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn('bg-white shadow-sm border border-gray-200 overflow-hidden', className)}>
        <CardHeader className="p-5 pb-3">
          <CardTitlePlaceholder />
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <div className="text-center py-8">
            <p className="text-red-500 text-sm mb-2 font-medium">Error loading events</p>
            <p className="text-gray-500 text-xs mb-4">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="text-brand-primary border-brand-primary hover:bg-primary-50"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn('bg-white shadow-sm border border-gray-200 overflow-hidden', className)}>
        <CardHeader className="p-5 pb-3 space-y-0">
          <div className="flex flex-row items-center justify-between gap-3">
            <p
              className="min-w-0 flex-1 truncate text-xs font-semibold leading-tight text-gray-900"
              title={formatWeekRangeFixed(weekStartMonday)}
            >
              {formatWeekRangeFixed(weekStartMonday)}
            </p>

            <div className="flex shrink-0 items-center gap-0.5">
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
        </CardHeader>

        <CardContent className="p-5 pt-0 space-y-4">
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekDays.map((day, i) => {
              const key = dayKey(day);
              const selected = isSameDay(day, selectedDate);
              const count = countEventsStartingOnLocalDate(events, day);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setSelectedDate(new Date(day.getFullYear(), day.getMonth(), day.getDate()))
                  }
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

          <div className="space-y-6">
            <div>
              <div className="mb-3">
                <h3 className="text-base font-semibold text-gray-900">This day</h3>
                <p className="text-sm text-gray-500">{formatLongDate(selectedDate)}</p>
              </div>
              {dayEvents.length === 0 ? (
                <p className="text-sm text-gray-500 py-2 text-center">No events on this day</p>
              ) : (
                <div className="space-y-2.5">
                  {dayEvents.map((event) => (
                    <WeekCardEventRow
                      key={event.id}
                      event={event}
                      formatEventDateTime={formatEventDateTime}
                      rsvpStatuses={rsvpStatuses}
                      getRSVPButtonVariant={getRSVPButtonVariant}
                      onOpen={openEvent}
                      onRSVP={handleRSVP}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Upcoming</h3>
                  <p className="text-sm text-gray-500">Published events still to come</p>
                </div>
                {upcomingDeduped.length > 0 && (
                  <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full shrink-0">
                    {upcomingDeduped.length}
                  </span>
                )}
              </div>
              {upcomingDeduped.length === 0 ? (
                <div className="text-center py-6">
                  <Calendar className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-gray-500 text-sm font-medium">No other upcoming events</p>
                  <p className="text-gray-400 text-xs mt-1">
                    Events on the selected day are listed above.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2.5">
                    {upcomingSlice.map((event) => (
                      <WeekCardEventRow
                        key={event.id}
                        event={event}
                        formatEventDateTime={formatEventDateTime}
                        rsvpStatuses={rsvpStatuses}
                        getRSVPButtonVariant={getRSVPButtonVariant}
                        onOpen={openEvent}
                        onRSVP={handleRSVP}
                      />
                    ))}
                  </div>
                  <UpcomingPagination
                    currentPage={upcomingPage}
                    totalPages={upcomingTotalPages}
                    onPrev={() => setUpcomingPage((p) => Math.max(1, p - 1))}
                    onNext={() => setUpcomingPage((p) => Math.min(upcomingTotalPages, p + 1))}
                    onPage={setUpcomingPage}
                  />
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedEvent(null);
          }}
          currentUserRsvp={rsvpStatuses[selectedEvent.id] || null}
          onRsvpChange={(eventId, status) => {
            void handleRSVP(eventId, status);
          }}
        />
      )}
    </>
  );
}

function CardTitlePlaceholder() {
  return <div className="h-5 w-40 rounded bg-gray-100 animate-pulse" />;
}
