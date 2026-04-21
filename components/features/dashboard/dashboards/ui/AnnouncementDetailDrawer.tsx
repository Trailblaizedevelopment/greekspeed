'use client';

import { useState, useEffect } from 'react';
import { Drawer } from 'vaul';
import { X, MessageSquare, AlertTriangle, GraduationCap, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Announcement } from '@/types/announcements';
import { Loader2, Check } from 'lucide-react';
import { getPrimaryLinkFromMetadata } from '@/lib/validation/announcementMetadata';
import { AnnouncementPrimaryLinkDisplay } from './AnnouncementPrimaryLinkDisplay';

// Helper to get icon and color based on announcement type
const getAnnouncementTypeConfig = (type: string) => {
  switch (type) {
    case 'urgent':
      return { icon: AlertTriangle, color: 'text-gray-700', bgColor: 'bg-gradient-to-br from-gray-200 to-white' };
    case 'event':
      return { icon: Calendar, color: 'text-brand-accent', bgColor: 'bg-gradient-to-br from-accent-100 to-white' };
    case 'academic':
      return { icon: GraduationCap, color: 'text-gray-600', bgColor: 'bg-gradient-to-br from-gray-100 to-white' };
    default:
      return { icon: MessageSquare, color: 'text-gray-600', bgColor: 'bg-gradient-to-br from-gray-100 to-white' };
    }
};

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

  if (diffInHours < 1) return 'Just now';
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

export interface AnnouncementDetailDrawerProps {
  announcement: Announcement | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkAsRead: (announcementId: string) => Promise<void>;
  markingAsRead: string | null;
}

export function AnnouncementDetailDrawer({
  announcement,
  isOpen,
  onClose,
  onMarkAsRead,
  markingAsRead,
}: AnnouncementDetailDrawerProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!announcement) return null;

  const typeConfig = getAnnouncementTypeConfig(announcement.announcement_type);
  const TypeIcon = typeConfig.icon;
  const primaryLink = getPrimaryLinkFromMetadata(announcement.metadata);

  const handleMarkAsRead = () => {
    onMarkAsRead(announcement.id)
      .then(() => onClose())
      .catch(() => {
        // Error already handled by parent; keep drawer open
      });
  };

  const drawerContent = (
    <>
      {/* Mobile drag handle */}
      {isMobile && (
        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mt-3 mb-2" />
      )}

      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
          <div
            className={`w-10 h-10 ${typeConfig.bgColor} rounded-full flex items-center justify-center shrink-0`}
          >
            <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 leading-tight break-words">
              {announcement.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
              <span>{announcement.sender?.full_name || 'Unknown'}</span>
              <span className="text-gray-400">•</span>
              <span>{formatRelativeTime(announcement.created_at)}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors shrink-0"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      {/* Content - dynamic height; scrolls when long, only as tall as needed when short */}
      <div
        className={`p-4 overflow-y-auto ${
          isMobile ? 'max-h-[50dvh]' : 'max-h-[50vh]'
        }`}
      >
        {primaryLink && (
          <AnnouncementPrimaryLinkDisplay link={primaryLink} variant="drawer" />
        )}
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {announcement.content}
        </p>
      </div>

      {/* Footer - Mark as read */}
      <div
        className={`flex-shrink-0 p-4 border-t border-gray-200 bg-gray-50 ${
          isMobile ? 'pb-[calc(1rem+env(safe-area-inset-bottom))]' : ''
        }`}
      >
        <Button
          onClick={handleMarkAsRead}
          disabled={markingAsRead === announcement.id}
          className="w-full h-10 text-brand-primary border-brand-primary hover:bg-primary-50 rounded-full"
          variant="outline"
        >
          {markingAsRead === announcement.id ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          Mark as read
        </Button>
      </div>
    </>
  );

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      direction="bottom"
      modal={true}
      dismissible={true}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/40 transition-opacity" />
        <Drawer.Content
          className={`
            bg-white flex flex-col z-[10000]
            fixed bottom-0 left-0 right-0
            ${
              isMobile
                ? 'max-h-[85dvh] rounded-t-[20px]'
                : 'max-w-lg mx-auto max-h-[80vh] rounded-t-[20px]'
            }
            shadow-2xl border border-gray-200
            outline-none
          `}
        >
          {drawerContent}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
