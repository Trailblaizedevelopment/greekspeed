'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MessageSquare, AlertTriangle, GraduationCap, Calendar, Check, Loader2, Eye } from 'lucide-react';
import { useAnnouncements } from '@/lib/hooks/useAnnouncements';
import { useAnnouncementsContext } from '@/lib/contexts/AnnouncementsContext';
import { Announcement } from '@/types/announcements';
import { toast } from 'react-toastify';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { AnnouncementDetailDrawer } from './AnnouncementDetailDrawer';
import { AlumniPagination } from '@/components/features/alumni/AlumniPagination';
import { getPrimaryLinkFromMetadata } from '@/lib/validation/announcementMetadata';
import { AnnouncementPrimaryLinkDisplay } from './AnnouncementPrimaryLinkDisplay';

// Helper function to get icon and color based on announcement type
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

// Helper function to format relative time
const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 1) return 'Just now';
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  
  return date.toLocaleDateString();
};

export function AnnouncementsCard() {
  const chapterId = useScopedChapterId();
  const context = useAnnouncementsContext();
  const hookData = useAnnouncements(context ? null : chapterId);
  const data = context ?? hookData;
  const { announcements, loading, markAsRead, refresh, pagination, fetchPageForModal } = data;

  // Desktop only: View All modal is for desktop (lg) only
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => setIsDesktop(typeof window !== 'undefined' && window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Add state for tracking which announcement is being marked as read
  const [markingAsRead, setMarkingAsRead] = useState<string | null>(null);
  // State for detail drawer
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  // State for View All modal (desktop only, with pagination)
  const [isViewAllOpen, setIsViewAllOpen] = useState(false);
  const [modalPage, setModalPage] = useState(1);
  const [modalAnnouncements, setModalAnnouncements] = useState<Announcement[]>([]);
  const [modalPagination, setModalPagination] = useState(data.pagination);
  const [modalLoading, setModalLoading] = useState(false);

  // When View All modal opens, init to page 1 (main list)
  useEffect(() => {
    if (isViewAllOpen && modalPage === 1) {
      setModalAnnouncements(announcements);
      setModalPagination(pagination);
    }
  }, [isViewAllOpen, modalPage, announcements, pagination]);

  const handleViewAllPageChange = async (page: number) => {
    setModalPage(page);
    if (page === 1) {
      setModalAnnouncements(announcements);
      setModalPagination(pagination);
      return;
    }
    setModalLoading(true);
    try {
      const res = await fetchPageForModal(page);
      setModalAnnouncements(res.announcements);
      setModalPagination(res.pagination);
    } finally {
      setModalLoading(false);
    }
  };

  // Display up to 10 in card; View All modal is desktop-only with pagination (10 per page)
  const DISPLAY_LIMIT = 10;
  const displayAnnouncements = announcements.slice(0, DISPLAY_LIMIT);
  const showViewAllButton = isDesktop && (pagination.total > 0 || announcements.length > 0);

  const handleMarkAsRead = async (announcementId: string): Promise<void> => {
    try {
      setMarkingAsRead(announcementId);
      const success = await markAsRead(announcementId);
      if (success) {
        if (window.innerWidth >= 640) {
          toast.success('Announcement marked as read and removed from your list', {
            position: 'top-right',
            autoClose: 3000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
        }
      } else {
        throw new Error('Failed to mark as read');
      }
    } catch (error) {
      console.error('Failed to mark announcement as read:', error);
      if (window.innerWidth >= 640) {
        toast.error('Failed to mark announcement as read. Please try again.', {
          position: 'top-right',
          autoClose: 3000,
        });
      }
      throw error; // Re-throw so drawer stays open on failure
    } finally {
      setMarkingAsRead(null);
    }
  };

  const openDetailDrawer = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setShowDetailDrawer(true);
  };

  const closeDetailDrawer = () => {
    setShowDetailDrawer(false);
    setSelectedAnnouncement(null);
  };

  // Render a single announcement item (clickable to open detail drawer)
  // isInModal: when true, full content shown and no line-clamp
  const renderAnnouncementItem = (announcement: Announcement, isInModal = false) => {
    const typeConfig = getAnnouncementTypeConfig(announcement.announcement_type);
    const TypeIcon = typeConfig.icon;
    const primaryLink = getPrimaryLinkFromMetadata(announcement.metadata);

    return (
      <div
        key={announcement.id}
        role="button"
        tabIndex={0}
        onClick={() => openDetailDrawer(announcement)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDetailDrawer(announcement);
          }
        }}
        className="p-3 border border-gray-200 rounded-lg hover:border-primary-300 hover:shadow-sm transition-all duration-200 bg-white cursor-pointer"
        aria-label={`View announcement: ${announcement.title}`}
      >
        <div className="flex items-start space-x-3">
          {/* Type icon */}
          <div
            className={`w-10 h-10 ${typeConfig.bgColor} rounded-full flex items-center justify-center shrink-0`}
          >
            <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Header with title */}
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-semibold text-gray-900 text-sm line-clamp-2 break-words flex-1">
                {announcement.title}
              </h4>
            </div>

            {primaryLink && (
              <AnnouncementPrimaryLinkDisplay link={primaryLink} variant="card" />
            )}

            {/* Content */}
            <p
              className={`text-xs text-gray-600 mb-3 break-words ${isInModal ? '' : 'line-clamp-2'}`}
            >
              {announcement.content}
            </p>

            {/* Footer with sender, time, and action */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="break-words">
                  {announcement.sender?.full_name || 'Unknown'}
                </span>
                <span className="text-gray-400">
                  {formatRelativeTime(announcement.created_at)}
                </span>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkAsRead(announcement.id);
                }}
                disabled={markingAsRead === announcement.id}
                className="text-brand-primary border-brand-primary hover:bg-primary-50 h-6 w-6 p-0 rounded-full flex items-center justify-center shrink-0"
                title="Mark as read"
              >
                {markingAsRead === announcement.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="text-lg font-semibold flex items-center space-x-2">
            <MessageSquare className="h-5 w-5 text-brand-primary" />
            <span className="text-gray-900">Chapter Announcements</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary mb-2"></div>
            <p className="text-gray-500 text-sm">Loading announcements...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (announcements.length === 0) {
    return (
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="text-lg font-semibold flex items-center space-x-2">
            <MessageSquare className="h-5 w-5 text-brand-primary" />
            <span className="text-gray-900">Chapter Announcements</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <MessageSquare className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No new announcements</p>
              <p className="text-gray-400 text-xs">You're all caught up!</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="text-lg font-semibold flex items-center justify-between">
            <span className="text-gray-900">Announcements</span>
            {announcements.length > 0 && (
              <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {announcements.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-3 flex flex-col">
          {/* Scrollable list - max height ~320px = ~5-6 items at ~56px each */}
          <div
            className="overflow-y-auto overscroll-contain pr-1 -mr-1 space-y-2.5 min-h-0"
            style={{ maxHeight: '320px' }}
          >
            {displayAnnouncements.map((announcement) =>
              renderAnnouncementItem(announcement)
            )}
          </div>

          {/* View All - desktop only; opens modal with pagination (10 per page) */}
          {showViewAllButton && (
            <div className="pt-3 border-t border-gray-200 mt-3">
              <Button
                variant="outline"
                className="w-full text-slate-600 border-gray-400 hover:bg-primary-50 h-8 rounded-full"
                onClick={() => {
                  setModalPage(1);
                  setModalAnnouncements(announcements);
                  setModalPagination(pagination);
                  setIsViewAllOpen(true);
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                View All ({(pagination.total || announcements.length) || 0})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View All Modal - desktop only; scrollable list + pagination (10 per page) */}
      <Dialog
        open={isViewAllOpen}
        onOpenChange={(open) => {
          setIsViewAllOpen(open);
          if (!open) setModalPage(1);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5 text-brand-primary" />
              <span>All Announcements</span>
              {(modalPagination.total || modalAnnouncements.length) > 0 && (
                <Badge variant="secondary" className="ml-2 bg-primary-100 text-primary-800">
                  {modalPagination.total || modalAnnouncements.length}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              View and manage all your chapter announcements
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable announcements list */}
          <div className="flex-1 overflow-y-auto pr-2 mt-4 min-h-0">
            {modalLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
              </div>
            ) : (
              <div className="space-y-3">
                {modalAnnouncements.map((announcement) =>
                  renderAnnouncementItem(announcement, true)
                )}
              </div>
            )}
          </div>

          {/* Footer - pagination (same as other pages) + refresh */}
          <div className="pt-4 border-t border-gray-100 mt-4 flex flex-col gap-3">
            {modalPagination.totalPages > 0 && (
              <AlumniPagination
                currentPage={modalPage}
                totalPages={modalPagination.totalPages}
                totalItems={modalPagination.total}
                itemsPerPage={modalPagination.limit || 10}
                onPageChange={handleViewAllPageChange}
                itemLabel="announcements"
              />
            )}
            <div className="flex justify-end">
              <Button
                variant="outline"
                className="text-brand-primary border-brand-primary hover:bg-primary-50"
                onClick={() => {
                  refresh();
                  if (modalPage === 1) {
                    setModalAnnouncements(announcements);
                    setModalPagination(pagination);
                  }
                }}
              >
                Refresh Announcements
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AnnouncementDetailDrawer
        announcement={selectedAnnouncement}
        isOpen={showDetailDrawer}
        onClose={closeDetailDrawer}
        onMarkAsRead={handleMarkAsRead}
        markingAsRead={markingAsRead}
      />
    </>
  );
}
