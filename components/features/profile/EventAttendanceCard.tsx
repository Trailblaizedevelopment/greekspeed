'use client';

import { Calendar, MapPin, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface EventRsvp {
  id: string;
  title: string;
  start_time: string;
  location?: string | null;
}

interface EventAttendanceCardProps {
  events: EventRsvp[];
  profileName?: string;
}

export function EventAttendanceCard({ events, profileName }: EventAttendanceCardProps) {
  if (events.length === 0) return null;

  return (
    <Card className="bg-white rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-accent" />
          {profileName ? `${profileName}'s Upcoming Events` : 'Upcoming Events'}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {events.map((event) => (
          <div key={event.id} className="p-3 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-1">
              {event.title}
            </h4>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              <span>
                {new Date(event.start_time).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {event.location && (
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{event.location}</span>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
