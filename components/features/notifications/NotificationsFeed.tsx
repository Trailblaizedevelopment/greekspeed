'use client';

import { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/supabase/auth-context';
import { useRouter } from 'next/navigation';
import { 
  UserPlus, 
  Users, 
  MessageCircle, 
  Bell, 
  Calendar,
  ChevronRight,
  UserRound,
} from 'lucide-react';
import { ClickableAvatar } from '@/components/features/user-profile/ClickableAvatar';
import { formatDistanceToNow, isToday, isYesterday, differenceInDays } from 'date-fns';

interface Notification {
  id: string;
  type:
    | 'connection_request'
    | 'connection_accepted'
    | 'message'
    | 'announcement'
    | 'event'
    | 'event_reminder'
    | 'membership_request';
  title: string;
  message: string;
  actionUrl: string;
  timestamp: string;
  metadata: any;
  read: boolean;
}

interface NotificationsFeedProps {
  variant?: 'desktop' | 'mobile';
  hideCard?: boolean;
}

export function NotificationsFeed({ variant = 'desktop', hideCard = false }: NotificationsFeedProps) {
  const { user, session } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const isMobile = variant === 'mobile';

  useEffect(() => {
    if (!user || !session) return;

    const fetchNotifications = async (isBackgroundRefresh = false) => {
      try {
        // Only show loading spinner on initial load, not background refreshes
        if (!isBackgroundRefresh) {
          setLoading(true);
        }
        
        const response = await fetch(`/api/notifications/feed?userId=${user.id}&limit=50`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch notifications');
        }

        const data = await response.json();
        setNotifications(data.notifications || []);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      } finally {
        setLoading(false);
        setIsInitialLoad(false);
      }
    };

    fetchNotifications(false);

    // Background refresh every 30 seconds (without showing loading spinner)
    const interval = setInterval(() => {
      fetchNotifications(true);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [user, session]);

  const getNotificationIcon = (type: string) => {
    // Unified, brand-aligned icon styling for all notification types
    const commonClasses = "h-5 w-5 text-brand-primary";
    switch (type) {
      case 'connection_request':
        return <UserPlus className={commonClasses} />;
      case 'connection_accepted':
        return <Users className={commonClasses} />;
      case 'message':
        return <MessageCircle className={commonClasses} />;
      case 'announcement':
        return <Bell className={commonClasses} />;
      case 'event':
      case 'event_reminder':
        return <Calendar className={commonClasses} />;
      case 'membership_request':
        return <UserRound className={commonClasses} />;
      default:
        return <Bell className={commonClasses + " opacity-60"} />;
    }
  };

  const getNotificationBadge = (type: string) => {
    switch (type) {
      // Unified, brand-aligned badge styling for all notification types
      case 'connection_request':
      case 'connection_accepted':
      case 'message':
      case 'announcement':
      case 'event':
      case 'event_reminder':
      case 'membership_request':
        return (
          <Badge className="bg-brand-primary/10 text-brand-primary text-xs font-medium border border-brand-primary/20">
            {(() => {
              switch (type) {
                case 'connection_request':
                  return 'Connection';
                case 'connection_accepted':
                  return 'Accepted';
                case 'message':
                  return 'Message';
                case 'announcement':
                  return 'Announcement';
                case 'event':
                  return 'Event';
                case 'event_reminder':
                  return 'RSVP';
                case 'membership_request':
                  return 'Membership';
                default:
                  return '';
              }
            })()}
          </Badge>
        );
      default:
        return null;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    router.push(notification.actionUrl);
  };

  // Group notifications by time period
  const groupedNotifications = useMemo(() => {
    const now = new Date();
    const groups: {
      label: string;
      notifications: Notification[];
    }[] = [
      { label: 'Today', notifications: [] },
      { label: 'Yesterday', notifications: [] },
      { label: 'Last 7 Days', notifications: [] },
      { label: 'Older', notifications: [] }
    ];

    notifications.forEach(notification => {
      const notificationDate = new Date(notification.timestamp);
      
      if (isToday(notificationDate)) {
        groups[0].notifications.push(notification);
      } else if (isYesterday(notificationDate)) {
        groups[1].notifications.push(notification);
      } else {
        const daysDiff = differenceInDays(now, notificationDate);
        if (daysDiff <= 7) {
          groups[2].notifications.push(notification);
        } else {
          groups[3].notifications.push(notification);
        }
      }
    });

    // Remove empty groups
    return groups.filter(group => group.notifications.length > 0);
  }, [notifications]);

  if (loading) {
    const LoadingContent = (
      <div className={hideCard ? 'p-6' : 'p-6'}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary" />
          <span className="ml-2 text-gray-600">Loading notifications...</span>
        </div>
      </div>
    );

    if (hideCard) {
      return <div className="w-full">{LoadingContent}</div>;
    }

    return (
      <div className="bg-white rounded-lg">
        {LoadingContent}
      </div>
    );
  }

  if (notifications.length === 0) {
    const EmptyContent = (
      <div className={hideCard ? 'p-6' : 'p-6'}>
        <div className={`text-center ${isMobile ? 'py-6' : 'py-8'} text-gray-500`}>
          <Bell className={`${isMobile ? 'h-8 w-8' : 'h-12 w-12'} mx-auto mb-2 text-gray-300`} />
          <p className={isMobile ? 'text-sm' : 'text-base'}>No recent activity</p>
          {!isMobile && (
            <p className="text-sm mt-1">Your recent notifications will appear here</p>
          )}
        </div>
      </div>
    );

    if (hideCard) {
      return <div className="w-full">{EmptyContent}</div>;
    }

    return (
      <div className="bg-white rounded-lg">
        {EmptyContent}
      </div>
    );
  }

  const mainContent = (
    <>
      {/* Header */}
      {!hideCard && (
        <div className={`${isMobile ? 'px-4 py-3' : 'px-6 py-4'} border-b border-gray-200`}>
          <h2 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold text-gray-900 flex items-center space-x-2`}>
            <Bell className="h-5 w-5 text-brand-primary" />
            <span>Recent Activity</span>
          </h2>
        </div>
      )}

      {/* Connection Management Button - Mobile Only */}
      {isMobile && (
        <div
          onClick={() => router.push('/dashboard/notifications/connections')}
          className={`bg-white rounded-full border border-gray-200 p-4 ${hideCard ? 'mx-4 my-4' : 'mx-4 my-4'} flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors`}
        >
          <div className="flex items-center space-x-3">
            <Users className="h-5 w-5 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">Connection Management</span>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
      )}

      {/* Notifications grouped by time */}
      <div>
        {groupedNotifications.map((group, groupIndex) => (
          <div key={group.label}>
            {/* Time period header */}
            <div className={`${hideCard ? 'px-4' : (isMobile ? 'px-4' : 'px-6')} ${isMobile ? 'py-3' : 'py-4'} bg-gray-50 border-b border-gray-200`}>
              <h3 className={`${isMobile ? 'text-sm' : 'text-base'} font-medium text-gray-700`}>
                {group.label}
              </h3>
            </div>

            {/* Notifications in this group */}
            <div>
              {group.notifications.map((notification, index) => {
                const avatarUrl = notification.metadata?.requesterAvatar || 
                                notification.metadata?.senderAvatar || 
                                notification.metadata?.userAvatar ||
                                notification.metadata?.creatorAvatar;
                const userName = notification.metadata?.requesterName || 
                               notification.metadata?.senderName || 
                               notification.metadata?.userName ||
                               notification.metadata?.creatorName;
                const userId = notification.metadata?.requesterId || 
                              notification.metadata?.senderId || 
                              notification.metadata?.userId ||
                              notification.metadata?.creatorId;

                return (
                  <div key={notification.id}>
                    <div
                      onClick={() => handleNotificationClick(notification)}
                      className={`
                        flex items-start space-x-3 cursor-pointer transition-colors
                        hover:bg-gray-50
                        ${hideCard ? 'px-4' : (isMobile ? 'px-4' : 'px-6')} ${isMobile ? 'py-3' : 'py-4'}
                      `}
                    >
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        {avatarUrl && userName && userId ? (
                          <ClickableAvatar
                            userId={userId}
                            avatarUrl={avatarUrl}
                            fullName={userName}
                            size={isMobile ? 'sm' : 'md'}
                            className={isMobile ? 'w-10 h-10' : 'w-12 h-12'}
                          />
                        ) : (
                          <div className={`
                            ${isMobile ? 'w-10 h-10' : 'w-12 h-12'} 
                            rounded-full bg-gray-100 flex items-center justify-center
                          `}>
                            {getNotificationIcon(notification.type)}
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className={`text-gray-900 ${isMobile ? 'text-sm' : 'text-base'} leading-snug`}>
                              <span className="font-medium">{userName || 'Someone'}</span>
                              {' '}
                              <span className="text-gray-600">{notification.message}</span>
                            </p>
                            {notification.metadata?.messagePreview && (
                              <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'} mt-1 truncate`}>
                                "{notification.metadata.messagePreview}"
                              </p>
                            )}
                            <div className="flex items-center space-x-2 mt-1.5">
                              <span className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                                {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
                              </span>
                              {getNotificationBadge(notification.type)}
                              {notification.metadata?.unreadCount && notification.metadata.unreadCount > 1 && (
                                <Badge variant="outline" className="text-xs">
                                  {notification.metadata.unreadCount} unread
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Divider - don't show after last notification in group */}
                    {index < group.notifications.length - 1 && (
                      <div className={`${hideCard ? 'mx-4' : (isMobile ? 'mx-4' : 'mx-6')} border-b border-gray-100`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Divider between groups - don't show after last group */}
            {groupIndex < groupedNotifications.length - 1 && (
              <div className="border-b border-gray-200" />
            )}
          </div>
        ))}
      </div>
    </>
  );

  if (hideCard) {
    return <div className="w-full bg-white">{mainContent}</div>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm border-opacity-80">
      {mainContent}
    </div>
  );
}
