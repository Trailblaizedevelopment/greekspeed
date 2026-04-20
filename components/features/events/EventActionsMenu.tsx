'use client';

import { useState, useEffect } from 'react';
import { MoreVertical, Calendar, Download, Link2, Share2, ExternalLink, Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/supabase/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useDropdownMenuClose,
} from '@/components/ui/dropdown-menu';
import {
  generateGoogleCalendarUrl,
  generateOutlookCalendarUrl,
  downloadICSFile,
  eventHasCalendarTimes,
} from '@/lib/utils/calendarUtils';
import { copyEventLinkToClipboard } from '@/lib/utils/eventLinkUtils';
import { toast } from 'react-toastify';
import { ShareEventDrawer } from '@/components/features/messaging/ShareEventDrawer';
import { cn } from '@/lib/utils';

export interface EventResendNotificationsConfig {
  defaultSendSms: boolean;
  defaultSendSmsToAlumni: boolean;
  visibleToActiveMembers: boolean;
  visibleToAlumni: boolean;
}

interface EventActionsMenuProps {
  event: {
    id: string;
    title: string;
    description?: string;
    location?: string;
    start_time: string | null;
    end_time: string | null;
  };
  onClose?: () => void;
  hideOnMobile?: boolean;
  /** When set, shows “Resend announcements” for chapter managers (same templates as publish). */
  resendNotifications?: EventResendNotificationsConfig;
}

function CalendarSubmenu({ event }: { event: EventActionsMenuProps['event'] }) {
  const close = useDropdownMenuClose();

  const handleAddToGoogleCalendar = () => {
    close();
    const url = generateGoogleCalendarUrl(event);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleAddToOutlookCalendar = () => {
    close();
    const url = generateOutlookCalendarUrl(event);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadICS = () => {
    close();
    downloadICSFile(event);
    toast.success('Calendar file downloaded');
  };

  return (
    <div
      className={cn(
        'absolute left-0 top-full z-[10000] mt-1 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg',
        'md:left-auto md:right-full md:top-0 md:mt-0 md:mr-1'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleAddToGoogleCalendar}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-gray-900 outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
      >
        <img
          src="/gmail-icon.png"
          alt="Google Calendar"
          className="h-4 w-4"
          width={16}
          height={16}
          style={{ display: 'inline-block' }}
        />
        Google
      </button>
      <button
        type="button"
        onClick={handleAddToOutlookCalendar}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-gray-900 outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
      >
        <img
          src="/outlook-logo.png"
          alt="Outlook Calendar"
          className="h-4 w-4"
          width={16}
          height={16}
          style={{ display: 'inline-block' }}
        />
        Outlook
      </button>
      <button
        type="button"
        onClick={handleDownloadICS}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-gray-900 outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
      >
        <Download className="h-4 w-4" />
        Download
      </button>
    </div>
  );
}

export function EventActionsMenu({
  event,
  onClose,
  hideOnMobile = false,
  resendNotifications,
}: EventActionsMenuProps) {
  const { getAuthHeadersAsync } = useAuth();
  const [showCalendarSubmenu, setShowCalendarSubmenu] = useState(false);
  const [shareDrawerOpen, setShareDrawerOpen] = useState(false);
  const [resendDialogOpen, setResendDialogOpen] = useState(false);
  const [sendSmsActive, setSendSmsActive] = useState(false);
  const [sendSmsAlumni, setSendSmsAlumni] = useState(false);
  const [resendSubmitting, setResendSubmitting] = useState(false);
  const canAddToCalendar = eventHasCalendarTimes(event);

  useEffect(() => {
    if (!resendDialogOpen || !resendNotifications) return;
    setSendSmsActive(
      Boolean(resendNotifications.defaultSendSms && resendNotifications.visibleToActiveMembers)
    );
    setSendSmsAlumni(
      Boolean(resendNotifications.defaultSendSmsToAlumni && resendNotifications.visibleToAlumni)
    );
  }, [resendDialogOpen, resendNotifications]);

  const handleCopyLink = async () => {
    const success = await copyEventLinkToClipboard(event.id, null, { ref: 'copy' });
    if (success) {
      toast.success('Event link copied to clipboard');
    } else {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = () => {
    setShareDrawerOpen(true);
  };

  const handleResendConfirm = async () => {
    setResendSubmitting(true);
    try {
      const headers = await getAuthHeadersAsync();
      const res = await fetch(`/api/events/${event.id}/resend-notifications`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          send_sms: sendSmsActive,
          send_sms_to_alumni: sendSmsAlumni,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; emailResult?: { totalRecipients: number } };
      if (!res.ok) {
        toast.error(data.error || 'Could not resend notifications');
        return;
      }
      toast.success(
        data.emailResult?.totalRecipients != null
          ? `Sent to ${data.emailResult.totalRecipients} recipient(s)`
          : 'Notifications sent'
      );
      setResendDialogOpen(false);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setResendSubmitting(false);
    }
  };

  return (
    <>
      <div className={hideOnMobile ? 'hidden md:block' : ''}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCalendarSubmenu(false)}
              className="h-6 w-6 rounded-full p-0 text-gray-500 hover:bg-gray-100"
              title="More actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Add to Calendar with submenu — requires both start and end times */}
            {canAddToCalendar ? (
              <div className="relative">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCalendarSubmenu((prev) => !prev);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowCalendarSubmenu((prev) => !prev);
                    }
                  }}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors',
                    'hover:bg-gray-100 focus:bg-gray-100 focus:outline-none'
                  )}
                >
                  <Calendar className="h-4 w-4" />
                  <span className="flex-1">Add to Calendar</span>
                  <ExternalLink className="h-3 w-3 text-gray-400" />
                </div>
                {showCalendarSubmenu && <CalendarSubmenu event={event} />}
              </div>
            ) : (
              <div className="px-3 py-2.5 text-xs text-gray-500">
                Add start &amp; end times to use calendar export
              </div>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleCopyLink} className="gap-2">
              <Link2 className="h-4 w-4" />
              Copy Event Link
            </DropdownMenuItem>

            <DropdownMenuItem onClick={handleShare} className="gap-2">
              <Share2 className="h-4 w-4" />
              Share Event
            </DropdownMenuItem>

            {resendNotifications ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => {
                    setResendDialogOpen(true);
                  }}
                >
                  <Mail className="h-4 w-4" />
                  Resend announcements
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={resendDialogOpen} onOpenChange={setResendDialogOpen}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Resend announcements</DialogTitle>
            <DialogDescription>
              Sends the same email, push, and optional SMS as when this event was published, using
              current audience visibility and member preferences.
            </DialogDescription>
          </DialogHeader>
          {resendNotifications ? (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="resend-sms-active"
                  checked={sendSmsActive}
                  disabled={!resendNotifications.visibleToActiveMembers}
                  onCheckedChange={(v) => setSendSmsActive(v === true)}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="resend-sms-active" className="text-sm font-medium text-gray-900">
                    SMS to active members and admins
                  </Label>
                  <p className="text-xs text-gray-500">
                    Only members with SMS consent and a valid phone number.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="resend-sms-alumni"
                  checked={sendSmsAlumni}
                  disabled={!resendNotifications.visibleToAlumni}
                  onCheckedChange={(v) => setSendSmsAlumni(v === true)}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="resend-sms-alumni" className="text-sm font-medium text-gray-900">
                    SMS to alumni
                  </Label>
                  <p className="text-xs text-gray-500">
                    Same eligibility rules as active member SMS.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setResendDialogOpen(false)} disabled={resendSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleResendConfirm} disabled={resendSubmitting}>
              {resendSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Resend'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareEventDrawer
        isOpen={shareDrawerOpen}
        onClose={() => setShareDrawerOpen(false)}
        eventToShare={{
          id: event.id,
          title: event.title,
          location: event.location,
          start_time: event.start_time,
        }}
      />
    </>
  );
}
