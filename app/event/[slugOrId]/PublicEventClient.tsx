'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Share2,
  Link2,
  ArrowLeft,
  CalendarPlus,
  Download,
  Check,
  HelpCircle,
  X,
  Lock,
  UserX,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Event, RSVPStatus } from '@/types/events';
import {
  generateGoogleCalendarUrl,
  generateOutlookCalendarUrl,
  downloadICSFile,
  eventHasCalendarTimes,
} from '@/lib/utils/calendarUtils';
import {
  formatEventDetailSchedule,
  isEventPastBySchedule,
  isRsvpWindowOpen,
} from '@/lib/utils/eventScheduleDisplay';
import { copyEventLinkToClipboard } from '@/lib/utils/eventLinkUtils';
import { toast } from 'react-toastify';
import { useAuth } from '@/lib/supabase/auth-context';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { DashboardHeader } from '@/components/features/dashboard/DashboardHeader';
import { MobileBottomNavigation } from '@/components/features/dashboard/dashboards/ui/MobileBottomNavigation';

interface Attendee {
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  status: RSVPStatus;
}

interface PublicEventClientProps {
  event: Event;
  attendeeCounts: {
    attending: number;
    maybe: number;
    not_attending: number;
  };
}

export function PublicEventClient({ event, attendeeCounts: initialCounts }: PublicEventClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const isLoggedIn = !!user;

  const [linkCopied, setLinkCopied] = useState(false);
  const [dismissedModal, setDismissedModal] = useState(false);
  const [userRsvp, setUserRsvp] = useState<RSVPStatus | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [attendeeCounts, setAttendeeCounts] = useState(initialCounts);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [showAttendeeList, setShowAttendeeList] = useState(false);

  // Fetch user's RSVP status and attendee list when logged in
  useEffect(() => {
    if (isLoggedIn && user?.id && event.id) {
      fetchUserRsvp();
      fetchAttendees();
    }
  }, [isLoggedIn, user?.id, event.id]);

  const fetchUserRsvp = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`/api/events/${event.id}/rsvp?user_id=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setUserRsvp(data.status || null);
      }
    } catch (error) {
      console.error('Error fetching RSVP:', error);
    }
  };

  const fetchAttendees = async () => {
    setLoadingAttendees(true);
    try {
      const response = await fetch(`/api/events/${event.id}/attendees`);
      if (response.ok) {
        const data = await response.json();
        // Combine all attendees into a flat list with their status
        const allAttendees: Attendee[] = [
          ...data.attending.map((a: any) => ({ ...a, status: 'attending' as RSVPStatus })),
          ...data.maybe.map((a: any) => ({ ...a, status: 'maybe' as RSVPStatus })),
        ];
        setAttendees(allAttendees);
        setAttendeeCounts(data.counts);
      }
    } catch (error) {
      console.error('Error fetching attendees:', error);
    } finally {
      setLoadingAttendees(false);
    }
  };

  const handleRsvp = async (status: RSVPStatus) => {
    if (!user?.id || rsvpLoading) return;

    setRsvpLoading(true);
    try {
      const response = await fetch(`/api/events/${event.id}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, user_id: user.id }),
      });

      if (response.ok) {
        setUserRsvp(status);
        toast.success(`RSVP updated to ${status === 'attending' ? 'Going' : status === 'maybe' ? 'Maybe' : 'Not Going'}`);
        // Refresh attendees
        fetchAttendees();
      } else {
        toast.error('Failed to update RSVP');
      }
    } catch (error) {
      console.error('Error updating RSVP:', error);
      toast.error('Failed to update RSVP');
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleCopyLink = async () => {
    const success = await copyEventLinkToClipboard(event.id, null, { ref: 'public_page' });
    if (success) {
      setLinkCopied(true);
      toast.success('Event link copied to clipboard!');
      setTimeout(() => setLinkCopied(false), 2000);
    } else {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/event/${event.id}`;
    const shareData = {
      title: event.title,
      text: `Check out this event: ${event.title}${event.location ? ` at ${event.location}` : ''}`,
      url: url,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Share failed:', error);
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleAddToGoogleCalendar = () => {
    if (!eventHasCalendarTimes(event)) return;
    const url = generateGoogleCalendarUrl(event);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleAddToOutlookCalendar = () => {
    if (!eventHasCalendarTimes(event)) return;
    const url = generateOutlookCalendarUrl(event);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadICS = () => {
    if (!eventHasCalendarTimes(event)) return;
    downloadICSFile(event);
    toast.success('Calendar file downloaded');
  };

  const handleClose = () => {
    router.back();
  };

  const isPastEvent = isEventPastBySchedule(event);
  const rsvpWindowOpen = isRsvpWindowOpen(event);
  const showCalendarExport = eventHasCalendarTimes(event);

  const getRsvpButtonClass = (status: RSVPStatus) => {
    const isActive = userRsvp === status;
    switch (status) {
      case 'attending':
        return isActive
          ? 'bg-green-600 hover:bg-green-700 text-white border-green-600'
          : 'bg-white hover:bg-green-50 text-gray-700 border-gray-300 hover:border-green-300';
      case 'maybe':
        return isActive
          ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500'
          : 'bg-white hover:bg-amber-50 text-gray-700 border-gray-300 hover:border-amber-300';
      case 'not_attending':
        return isActive
          ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
          : 'bg-white hover:bg-red-50 text-gray-700 border-gray-300 hover:border-red-300';
      default:
        return 'bg-white text-gray-700 border-gray-300';
    }
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ==================== MOBILE LAYOUT ==================== */}
      <div className="min-h-screen bg-white sm:hidden pb-20">
        {/* Header - MarketingHeader for non-auth */}
        {!isLoggedIn && <MarketingHeader hideNavigation={true} />}

        {/* Event Hero Banner */}
        <div className="relative">
          <div className={`bg-gradient-to-br from-brand-primary via-brand-primary-hover to-brand-accent relative ${!isLoggedIn ? 'pt-4' : ''}`}>
            {/* Back Button for logged-in users */}
            {isLoggedIn && (
              <button
                onClick={handleClose}
                className="absolute top-3 left-3 z-10 h-10 w-10 rounded-full flex items-center justify-center cursor-pointer group"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <ArrowLeft className="h-5 w-5 text-gray-700" />
              </button>
            )}

            {/* Share Button */}
            <button
              onClick={handleShare}
              className="absolute top-3 right-3 z-10 h-10 w-10 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <Share2 className="h-5 w-5 text-gray-700" />
            </button>

            {/* Event Info */}
            <div className="px-4 py-8 pt-16 text-white">
              {isPastEvent && (
                <Badge className="bg-white/20 text-white mb-3 border-0">
                  Past Event
                </Badge>
              )}
              <h1 className="text-2xl font-bold mb-3">{event.title}</h1>
              <div className="flex items-center gap-2 text-white/90">
                <Users className="h-4 w-4" />
                <span>{attendeeCounts.attending} attending</span>
                {attendeeCounts.maybe > 0 && (
                  <span className="ml-2">· {attendeeCounts.maybe} maybe</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sign-up CTA for non-logged-in users */}
        {!isLoggedIn && (
          <div className="px-4 py-3 bg-accent-50 border-b border-accent-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Join to RSVP</p>
                <p className="text-xs text-gray-600 mt-0.5">See who's attending</p>
              </div>
              <Link href="/sign-up">
                <Button
                  size="sm"
                  className="text-white rounded-full bg-brand-primary hover:bg-brand-primary-hover"
                >
                  Sign Up
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* RSVP Section for logged-in users */}
        {isLoggedIn && !isPastEvent && (
          <div className="px-4 py-4 bg-white border-b border-gray-100">
            <p className="text-xs text-gray-500 mb-3 text-center font-medium">Your Response</p>
            {!rsvpWindowOpen && (
              <p className="text-xs text-amber-700 text-center mb-2">RSVP is closed for this event.</p>
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => handleRsvp('attending')}
                disabled={rsvpLoading || !rsvpWindowOpen}
                className={`flex-1 h-10 border rounded-full transition-all text-sm ${getRsvpButtonClass('attending')}`}
                variant="outline"
              >
                <Users className="h-4 w-4 mr-1.5" />
                Going
              </Button>
              <Button
                onClick={() => handleRsvp('maybe')}
                disabled={rsvpLoading || !rsvpWindowOpen}
                className={`flex-1 h-10 border rounded-full transition-all text-sm ${getRsvpButtonClass('maybe')}`}
                variant="outline"
              >
                <HelpCircle className="h-4 w-4 mr-1.5" />
                Maybe
              </Button>
              <Button
                onClick={() => handleRsvp('not_attending')}
                disabled={rsvpLoading || !rsvpWindowOpen}
                className={`flex-1 h-10 border rounded-full transition-all text-sm ${getRsvpButtonClass('not_attending')}`}
                variant="outline"
              >
                <X className="h-4 w-4 mr-1.5" />
                No
              </Button>
            </div>
          </div>
        )}

        {/* Event Details */}
        <div className="px-4 py-6 space-y-5">
          {/* Date & Time */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
              <Calendar className="h-5 w-5 text-brand-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Date & Time</h3>
              <p className="text-gray-600 text-sm whitespace-pre-wrap">
                {formatEventDetailSchedule(event.start_time, event.end_time)}
              </p>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-5 w-5 text-brand-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Location</h3>
                <p className="text-gray-600 text-sm">{event.location}</p>
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="pt-2">
              <h3 className="font-semibold text-gray-900 text-sm mb-2">About this event</h3>
              <p className="text-gray-600 text-sm whitespace-pre-wrap leading-relaxed">
                {event.description}
              </p>
            </div>
          )}

          {/* Attendees - Only for logged-in users */}
          {isLoggedIn && attendees.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowAttendeeList(!showAttendeeList)}
                className="w-full flex items-center justify-between py-3 border-t border-gray-100"
              >
                <h3 className="font-semibold text-gray-900 text-sm">
                  Who's Going ({attendeeCounts.attending + attendeeCounts.maybe})
                </h3>
                {showAttendeeList ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>

              {showAttendeeList && (
                <div className="space-y-2 mt-2">
                  {attendees.slice(0, 10).map((attendee) => (
                    <div key={attendee.user_id} className="flex items-center gap-3 py-2">
                      {attendee.avatar_url ? (
                        <img
                          src={attendee.avatar_url}
                          alt={`${attendee.first_name}`}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center">
                          <span className="text-xs font-medium text-brand-primary">
                            {attendee.first_name?.[0]}{attendee.last_name?.[0]}
                          </span>
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {attendee.first_name} {attendee.last_name}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs ${attendee.status === 'attending'
                          ? 'border-green-200 text-green-700 bg-green-50'
                          : 'border-amber-200 text-amber-700 bg-amber-50'
                          }`}
                      >
                        {attendee.status === 'attending' ? 'Going' : 'Maybe'}
                      </Badge>
                    </div>
                  ))}
                  {attendees.length > 10 && (
                    <p className="text-xs text-gray-500 text-center py-2">
                      +{attendees.length - 10} more
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Calendar Actions */}
          {!isPastEvent && showCalendarExport && (
            <div className="pt-4 border-t border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm mb-3">Add to calendar</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddToGoogleCalendar}
                  className="flex items-center gap-2 rounded-full"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Google
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddToOutlookCalendar}
                  className="flex items-center gap-2 rounded-full"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Outlook
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadICS}
                  className="flex items-center gap-2 rounded-full"
                >
                  <Download className="h-4 w-4" />
                  .ics
                </Button>
              </div>
            </div>
          )}

          {/* Sign in CTA for non-logged-in users */}
          {!isLoggedIn && (
            <div className="pt-4 border-t border-gray-100">
              <div className="bg-gray-50 rounded-xl p-5 text-center">
                <Lock className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-900 mb-2">
                  Want to RSVP?
                </h3>
                <p className="text-gray-600 text-sm mb-4">
                  Sign in to RSVP and see who else is attending.
                </p>
                <div className="flex gap-2 justify-center">
                  <Link href="/sign-in">
                    <Button variant="outline" className="rounded-full">
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/sign-up">
                    <Button className="bg-brand-primary hover:bg-brand-primary-hover text-white rounded-full">
                      Join Free
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-6 text-gray-500 text-xs border-t border-gray-100">
          <p>
            Powered by{' '}
            <a
              href="https://trailblaize.net"
              className="text-brand-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Trailblaize
            </a>
          </p>
        </div>

        {/* Mobile Bottom Navigation for logged-in users */}
        {isLoggedIn && <MobileBottomNavigation />}
      </div>

      {/* ==================== DESKTOP LAYOUT ==================== */}
      <div className="min-h-screen bg-gray-50 hidden sm:block">
        {/* Conditional Header */}
        {isLoggedIn ? <DashboardHeader /> : <MarketingHeader hideNavigation={true} />}

        {/* Sign-In Modal for non-logged-in users */}
        {!isLoggedIn && !dismissedModal && (
          <div className="fixed top-16 left-0 right-0 z-40 animate-[slide-down_0.3s_ease-out] shadow-lg">
            <div className="bg-white border-b border-gray-200">
              <div className="max-w-7xl mx-auto px-8 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-accent-100 flex items-center justify-center flex-shrink-0">
                      <Lock className="h-5 w-5 text-brand-accent" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        RSVP to {event.title}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Sign in to RSVP and see who else is attending
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href="/sign-in">
                      <Button variant="outline" className="px-6 rounded-full">
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/sign-up">
                      <Button className="bg-brand-primary hover:bg-brand-primary-hover text-white px-6 rounded-full">
                        Join Trailblaize
                      </Button>
                    </Link>
                    <button
                      onClick={() => setDismissedModal(true)}
                      className="text-gray-400 hover:text-gray-600 p-2 -mr-2"
                      aria-label="Dismiss"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content - Single Column Full Width */}
        <main className={`w-full ${!isLoggedIn ? (dismissedModal ? 'pt-16' : 'pt-24') : ''}`}>
          <div className="bg-white shadow-sm border border-gray-200 overflow-hidden">
            {/* Event Header */}
            <div className="bg-gradient-to-br from-brand-primary via-brand-primary-hover to-brand-accent p-8 text-white relative">
              {/* Back Button for logged-in users */}
              {isLoggedIn && (
                <button
                  onClick={handleClose}
                  className="absolute top-4 left-4 h-10 w-10 rounded-full flex items-center justify-center cursor-pointer group"
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <ArrowLeft className="h-5 w-5 text-white" />
                </button>
              )}

              {/* Share Button */}
              <button
                onClick={handleShare}
                className="absolute top-4 right-4 h-10 w-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <Share2 className="h-5 w-5 text-white" />
              </button>

              <div className={isLoggedIn ? 'pl-12 pr-12' : 'pr-12'}>
                {isPastEvent && (
                  <Badge className="bg-white/20 text-white mb-3 border-0">
                    Past Event
                  </Badge>
                )}
                <h1 className="text-3xl font-bold mb-3">{event.title}</h1>
                <div className="flex flex-wrap items-center gap-4 text-white/90">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{attendeeCounts.attending} attending</span>
                  </div>
                  {attendeeCounts.maybe > 0 && (
                    <div className="flex items-center gap-2">
                      <HelpCircle className="h-4 w-4" />
                      <span>{attendeeCounts.maybe} maybe</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RSVP Section - Right below header */}
            {!isPastEvent && (
              <div className="px-8 py-5 bg-gray-50 border-b border-gray-100">
                {isLoggedIn ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-3 font-medium">Your Response</p>
                    {!rsvpWindowOpen && (
                      <p className="text-xs text-amber-700 mb-2">RSVP is closed for this event.</p>
                    )}
                    <div className="flex gap-3">
                      <Button
                        onClick={() => handleRsvp('attending')}
                        disabled={rsvpLoading || !rsvpWindowOpen}
                        className={`flex-1 h-11 border rounded-full transition-all ${getRsvpButtonClass('attending')}`}
                        variant="outline"
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Going
                      </Button>
                      <Button
                        onClick={() => handleRsvp('maybe')}
                        disabled={rsvpLoading || !rsvpWindowOpen}
                        className={`flex-1 h-11 border rounded-full transition-all ${getRsvpButtonClass('maybe')}`}
                        variant="outline"
                      >
                        <HelpCircle className="h-4 w-4 mr-2" />
                        Maybe
                      </Button>
                      <Button
                        onClick={() => handleRsvp('not_attending')}
                        disabled={rsvpLoading || !rsvpWindowOpen}
                        className={`flex-1 h-11 border rounded-full transition-all ${getRsvpButtonClass('not_attending')}`}
                        variant="outline"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Can't Go
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Lock className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">Want to RSVP?</p>
                        <p className="text-sm text-gray-600">Sign in to RSVP and see who's attending</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href="/sign-in">
                        <Button variant="outline" className="rounded-full">
                          Sign In
                        </Button>
                      </Link>
                      <Link href="/sign-up">
                        <Button className="bg-brand-primary hover:bg-brand-primary-hover text-white rounded-full">
                          Join Free
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Event Details */}
            <div className="p-8 space-y-6">
              {/* Date & Time + Location - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Date & Time */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                    <Calendar className="h-6 w-6 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Date & Time</h3>
                    <p className="text-gray-600 whitespace-pre-wrap">
                      {formatEventDetailSchedule(event.start_time, event.end_time)}
                    </p>
                  </div>
                </div>

                {/* Location */}
                {event.location && (
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-6 w-6 text-brand-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">Location</h3>
                      <p className="text-gray-600">{event.location}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              {event.description && (
                <div className="pt-6 border-t border-gray-100">
                  <h3 className="font-semibold text-gray-900 mb-3">About this event</h3>
                  <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">
                    {event.description}
                  </p>
                </div>
              )}

              {/* Attendees Section - Only for logged-in users */}
              {isLoggedIn && attendees.length > 0 && (
                <div className="pt-6 border-t border-gray-100">
                  <h3 className="font-semibold text-gray-900 mb-4">
                    Who's Going ({attendeeCounts.attending + attendeeCounts.maybe})
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {attendees.slice(0, 8).map((attendee) => (
                      <div key={attendee.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                        {attendee.avatar_url ? (
                          <img
                            src={attendee.avatar_url}
                            alt={`${attendee.first_name}`}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center">
                            <span className="text-sm font-medium text-brand-primary">
                              {attendee.first_name?.[0]}{attendee.last_name?.[0]}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {attendee.first_name} {attendee.last_name}
                          </p>
                          <p className={`text-xs ${attendee.status === 'attending' ? 'text-green-600' : 'text-amber-600'
                            }`}>
                            {attendee.status === 'attending' ? 'Going' : 'Maybe'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {attendees.length > 8 && (
                    <p className="text-sm text-gray-500 text-center mt-4">
                      +{attendees.length - 8} more attending
                    </p>
                  )}
                </div>
              )}

              {/* Actions Row - Calendar + Share */}
              {!isPastEvent && (
                <div className="pt-6 border-t border-gray-100">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    {/* Calendar Actions */}
                    {showCalendarExport && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-3">Add to calendar</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddToGoogleCalendar}
                          className="rounded-full"
                        >
                          <CalendarPlus className="h-4 w-4 mr-2" />
                          Google
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddToOutlookCalendar}
                          className="rounded-full"
                        >
                          <CalendarPlus className="h-4 w-4 mr-2" />
                          Outlook
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadICS}
                          className="rounded-full"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          .ics
                        </Button>
                      </div>
                    </div>
                    )}

                    {/* Share Actions */}
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-3">Share event</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyLink}
                          className="rounded-full"
                        >
                          {linkCopied ? (
                            <>
                              <Check className="h-4 w-4 mr-2 text-green-600" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Link2 className="h-4 w-4 mr-2" />
                              Copy Link
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleShare}
                          className="rounded-full"
                        >
                          <Share2 className="h-4 w-4 mr-2" />
                          Share
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sign-in CTA for non-logged-in users (bottom) */}
              {!isLoggedIn && (
                <div className="pt-6 border-t border-gray-100">
                  <div className="bg-gradient-to-r from-accent-50 to-primary-50 rounded-xl p-6 text-center">
                    <h3 className="font-semibold text-gray-900 mb-2">
                      Join Trailblaize to connect
                    </h3>
                    <p className="text-gray-600 text-sm mb-4">
                      RSVP to events, see who's attending, and connect with others.
                    </p>
                    <div className="flex justify-center gap-3">
                      <Link href="/sign-in">
                        <Button variant="outline" className="rounded-full px-6">
                          Sign In
                        </Button>
                      </Link>
                      <Link href="/sign-up">
                        <Button
                          className="text-white rounded-full px-6 bg-brand-primary hover:bg-brand-primary-hover"
                        >
                          Join Free
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-10 text-gray-500 text-sm">
            <p>
              Powered by{' '}
              <a
                href="https://trailblaize.net"
                className="text-brand-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Trailblaize
              </a>
            </p>
          </div>
        </main>
      </div>
    </>
  );
}
