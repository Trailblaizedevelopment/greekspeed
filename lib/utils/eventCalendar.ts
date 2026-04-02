import type { Event } from '@/types/events';
import {
  compareEventsByStartAsc,
  isValidIsoDateTime,
} from '@/lib/utils/eventScheduleDisplay';

/** Whether the event’s start falls on the given calendar day in the user’s local timezone. */
export function eventStartsOnLocalDate(
  event: { start_time: string | null },
  date: Date
): boolean {
  if (!isValidIsoDateTime(event.start_time)) return false;
  const eventDate = new Date(event.start_time!);
  return (
    eventDate.getDate() === date.getDate() &&
    eventDate.getMonth() === date.getMonth() &&
    eventDate.getFullYear() === date.getFullYear()
  );
}

export function filterEventsStartingOnLocalDate(events: Event[], date: Date): Event[] {
  return events
    .filter((e) => eventStartsOnLocalDate(e, date))
    .sort(compareEventsByStartAsc);
}

export function countEventsStartingOnLocalDate(events: Event[], date: Date): number {
  return events.filter((e) => eventStartsOnLocalDate(e, date)).length;
}
