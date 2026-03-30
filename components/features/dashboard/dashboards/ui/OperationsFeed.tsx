'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Drawer } from 'vaul';
import { Clock, DollarSign, FileText, Megaphone, CheckCircle, Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';

interface ActivityItem {
  id: string;
  type: 'event' | 'announcement' | 'task' | 'document' | 'payment';
  title: string;
  meta: string;
  createdAt: string;
  icon: any;
  user?: {
    full_name: string;
    first_name: string;
    last_name: string;
  };
}

// Pagination constants
const ITEMS_PER_PAGE = 15;

export function OperationsFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [allActivities, setAllActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalFetched, setTotalFetched] = useState(0);
  const chapterId = useScopedChapterId();
  const { enabled: eventsManagementEnabled } = useFeatureFlag('events_management_enabled');
  const [totalItems, setTotalItems] = useState(0);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch activities for the drawer with pagination
  const fetchActivitiesForDrawer = async (page: number = 1) => {
    if (!chapterId) return;

    try {
      setDrawerLoading(true);
      // Fetch all activities to get total count (could optimize with server-side pagination)
      const allData = await fetchActivitiesFromDatabase(100);

      // Calculate pagination
      const total = allData.length;
      const startIndex = (page - 1) * ITEMS_PER_PAGE;
      const endIndex = startIndex + ITEMS_PER_PAGE;
      const pageData = allData.slice(startIndex, endIndex);

      setTotalItems(total);
      setAllActivities(pageData);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setDrawerLoading(false);
    }
  };

  // Handle opening the drawer
  const handleOpenDrawer = () => {
    setDrawerOpen(true);
    setCurrentPage(1);
    setAllActivities([]);
    fetchActivitiesForDrawer(1);
  };

  // Pagination handlers
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      fetchActivitiesForDrawer(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      fetchActivitiesForDrawer(currentPage + 1);
    }
  };

  const fetchActivitiesFromDatabase = useCallback(async (limit: number): Promise<ActivityItem[]> => {
    if (!chapterId) return [];

    // Calculate date 2 months ago for filtering
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const twoMonthsAgoISO = twoMonthsAgo.toISOString();

    // Build fetch promises - conditionally include events
    const fetchPromises = [
      // Recent Events - only if events management is enabled
      ...(eventsManagementEnabled ? [
        supabase
          .from('events')
          .select('id, title, created_at, created_by')
          .eq('chapter_id', chapterId)
          .gte('created_at', twoMonthsAgoISO)  // <-- ADD THIS
          .order('created_at', { ascending: false })
          .limit(limit)
      ] : [Promise.resolve({ data: null, error: null })]),

      // Recent Announcements  
      supabase
        .from('announcements')
        .select(`
        id, title, created_at, sender_id,
        sender:profiles!sender_id(full_name, first_name, last_name)
      `)
        .eq('chapter_id', chapterId)
        .gte('created_at', twoMonthsAgoISO)  // <-- ADD THIS
        .order('created_at', { ascending: false })
        .limit(limit),

      // Recent Tasks
      supabase
        .from('tasks')
        .select(`
        id, title, status, created_at, assigned_by,
        assigner:profiles!assigned_by(full_name, first_name, last_name)
      `)
        .eq('chapter_id', chapterId)
        .gte('created_at', twoMonthsAgoISO)  // <-- ADD THIS
        .order('created_at', { ascending: false })
        .limit(limit),

      // Recent Documents
      supabase
        .from('documents')
        .select(`
        id, title, created_at, owner_id,
        owner:profiles!owner_id(full_name, first_name, last_name)
      `)
        .eq('chapter_id', chapterId)
        .gte('created_at', twoMonthsAgoISO)  // <-- ADD THIS
        .order('created_at', { ascending: false })
        .limit(limit),

      // Recent Dues Payments
      supabase
        .from('dues_assignments')
        .select(`
        id, status, amount_paid, updated_at, user_id,
        user:profiles!user_id(full_name, first_name, last_name),
        cycle:dues_cycles(name)
      `)
        .eq('cycle.chapter_id', chapterId)
        .eq('status', 'paid')
        .gte('updated_at', twoMonthsAgoISO)  // <-- ADD THIS (uses updated_at for payments)
        .order('updated_at', { ascending: false })
        .limit(limit)
    ];

    const [eventsResult, announcementsResult, tasksResult, documentsResult, duesResult] = await Promise.all(fetchPromises);

    // Transform data into unified activity format
    const allActivities: ActivityItem[] = [];

    // Process Events - Only if events management is enabled
    if (eventsManagementEnabled && eventsResult.data) {
      (eventsResult.data as Array<{ id: any; title: any; created_at: any; created_by: any }>).forEach(event => {
        allActivities.push({
          id: `event-${event.id}`,
          type: 'event',
          title: 'New Event Created',
          meta: event.title,
          createdAt: event.created_at,
          icon: Calendar
        });
      });
    }

    // Process Announcements
    if (announcementsResult.data) {
      (announcementsResult.data as Array<{
        id: any;
        title: any;
        created_at: any;
        sender_id: any;
        sender: { full_name: any; first_name: any; last_name: any; } | { full_name: any; first_name: any; last_name: any; }[];
      }>).forEach(announcement => {
        allActivities.push({
          id: `announcement-${announcement.id}`,
          type: 'announcement',
          title: 'Announcement Sent',
          meta: announcement.title,
          createdAt: announcement.created_at,
          icon: Megaphone,
          user: Array.isArray(announcement.sender) ? announcement.sender[0] : announcement.sender
        });
      });
    }

    // Process Tasks
    if (tasksResult.data) {
      (tasksResult.data as Array<{
        id: any;
        title: any;
        status: any;
        created_at: any;
        assigned_by: any;
        assigner: { full_name: any; first_name: any; last_name: any; } | { full_name: any; first_name: any; last_name: any; }[];
      }>).forEach(task => {
        allActivities.push({
          id: `task-${task.id}`,
          type: 'task',
          title: `Task ${task.status === 'completed' ? 'Completed' : 'Created'}`,
          meta: task.title,
          createdAt: task.created_at,
          icon: CheckCircle,
          user: Array.isArray(task.assigner) ? task.assigner[0] : task.assigner
        });
      });
    }

    // Process Documents
    if (documentsResult.data) {
      (documentsResult.data as Array<{
        id: any;
        title: any;
        created_at: any;
        owner_id: any;
        owner: { full_name: any; first_name: any; last_name: any; } | { full_name: any; first_name: any; last_name: any; }[];
      }>).forEach(doc => {
        allActivities.push({
          id: `document-${doc.id}`,
          type: 'document',
          title: 'Document Uploaded',
          meta: doc.title,
          createdAt: doc.created_at,
          icon: FileText,
          user: Array.isArray(doc.owner) ? doc.owner[0] : doc.owner
        });
      });
    }

    // Process Dues Payments
    if (duesResult.data) {
      (duesResult.data as Array<{
        id: any;
        status: any;
        amount_paid: any;
        updated_at: any;
        user_id: any;
        user: { full_name: any; first_name: any; last_name: any; } | { full_name: any; first_name: any; last_name: any; }[];
        cycle: { name: any; } | { name: any; }[];
      }>).forEach(dues => {
        const user = Array.isArray(dues.user) ? dues.user[0] : dues.user;
        allActivities.push({
          id: `dues-${dues.id}`,
          type: 'payment',
          title: 'Dues Payment Received',
          meta: `${user?.full_name || 'Member'} paid $${dues.amount_paid}`,
          createdAt: dues.updated_at,
          icon: DollarSign,
          user: user
        });
      });
    }

    // Sort by creation date and return ONLY the requested limit
    return allActivities
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }, [chapterId, eventsManagementEnabled]);

  // Initial load (skeleton only on first paint for this chapter / when query shape changes)
  useEffect(() => {
    if (!chapterId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const limit = typeof window !== 'undefined' && window.innerWidth < 640 ? 3 : 5;
        const next = await fetchActivitiesFromDatabase(limit);
        if (!cancelled) setActivities(next);
      } catch (error) {
        console.error('Error fetching recent activities:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chapterId, fetchActivitiesFromDatabase]);

  // Realtime: debounced quiet refetch (no full-card skeleton)
  useEffect(() => {
    if (!chapterId) return;

    const debounceMs = 350;

    const scheduleQuietRefetch = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(async () => {
        debounceTimerRef.current = null;
        try {
          const limit = typeof window !== 'undefined' && window.innerWidth < 640 ? 3 : 5;
          const next = await fetchActivitiesFromDatabase(limit);
          setActivities(next);
        } catch (error) {
          console.error('Error refreshing operations feed:', error);
        }
      }, debounceMs);
    };

    const chapterFilter = `chapter_id=eq.${chapterId}`;

    let channel = supabase.channel(`operations-feed-${chapterId}`);

    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'announcements', filter: chapterFilter },
      scheduleQuietRefetch
    );
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: chapterFilter },
      scheduleQuietRefetch
    );
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'documents', filter: chapterFilter },
      scheduleQuietRefetch
    );

    if (eventsManagementEnabled) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: chapterFilter },
        scheduleQuietRefetch
      );
    }

    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dues_assignments' },
      scheduleQuietRefetch
    );

    channel.subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [chapterId, eventsManagementEnabled, fetchActivitiesFromDatabase]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'event': return 'bg-accent-100 text-accent-800';
      case 'payment': return 'bg-green-100 text-green-800';
      case 'task': return 'bg-purple-100 text-purple-800';
      case 'document': return 'bg-orange-100 text-orange-800';
      case 'announcement': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'event': return 'Event';
      case 'payment': return 'Payment';
      case 'task': return 'Task';
      case 'document': return 'Document';
      case 'announcement': return 'Announcement';
      default: return 'Other';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const renderActivityItem = (item: ActivityItem) => {
    const IconComponent = item.icon;
    return (
      <div key={item.id} className="flex items-start space-x-3 p-2 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors overflow-hidden">
        <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center text-brand-primary shrink-0">
          <IconComponent className="h-3 w-3" />
        </div>

        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center space-x-2 mb-1">
            <h4 className="font-medium text-gray-900 text-sm truncate">{item.title}</h4>
          </div>
          <p className="text-xs text-gray-600 truncate mb-1">{item.meta}</p>
          <div className="flex items-center text-xs text-gray-500">
            <span className="shrink-0">{formatTimeAgo(item.createdAt)}</span>
            {item.user && (
              <span className="truncate ml-2">
                by {item.user.full_name || `${item.user.first_name} ${item.user.last_name}`}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <Clock className="h-5 w-5 text-brand-primary" />
            <span>Chapter Notifications</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-gray-200 rounded-lg"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center space-x-2">
          <Clock className="h-5 w-5 text-brand-primary" />
          <span>Chapter Notifications</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Main Feed - Shows 5 most recent activities */}
        <div className="space-y-4">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>No recent activity</p>
            </div>
          ) : (
            activities.map(renderActivityItem)
          )}
        </div>

        <div className="pt-4 border-t border-gray-100">
          {/* View All Activities Drawer Button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-10 rounded-full text-brand-primary border-brand-primary bg-white hover:bg-primary-50 font-medium text-sm shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-300"
            onClick={handleOpenDrawer}
          >
            <Clock className="h-4 w-4 mr-2" />
            View All
          </Button>

          {/* Activity Drawer */}
          <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <Drawer.Portal>
              <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/40" />
              <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[10000] bg-white rounded-t-[20px] max-h-[85vh] max-w-lg mx-auto flex flex-col outline-none">
                {/* Drawer Handle */}
                <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-300 my-3" />

                {/* Header */}
                <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-200">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-5 w-5 text-brand-primary" />
                    <h3 className="text-lg font-semibold text-gray-900">All Chapter Activity</h3>
                  </div>
                  <button
                    onClick={() => setDrawerOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {drawerLoading && allActivities.length === 0 ? (
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="animate-pulse h-16 bg-gray-200 rounded-lg" />
                      ))}
                    </div>
                  ) : allActivities.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Clock className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                      <p className="text-base">No activity found</p>
                      <p className="text-sm text-gray-400 mt-1">Activities will appear here as they happen</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {allActivities.map(renderActivityItem)}
                    </div>
                  )}
                </div>

                {/* Footer with Pagination */}
                <div className="border-t border-gray-200 p-4 flex-shrink-0 space-y-3">
                  {/* Item count */}
                  <p className="text-center text-xs text-gray-500">
                    Showing {allActivities.length > 0 ? ((currentPage - 1) * ITEMS_PER_PAGE + 1) : 0} to {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} activities
                  </p>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center space-x-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePreviousPage}
                        disabled={currentPage === 1 || drawerLoading}
                        className="h-8 px-3 text-xs rounded-full"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                        Previous
                      </Button>
                      <div className="flex items-center space-x-1">
                        <span className="text-xs text-gray-600">Page</span>
                        <span className="text-xs font-medium">{currentPage}</span>
                        <span className="text-xs text-gray-600">of</span>
                        <span className="text-xs font-medium">{totalPages}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={currentPage === totalPages || drawerLoading}
                        className="h-8 px-3 text-xs rounded-full"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                  )}
                </div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        </div>
      </CardContent>
    </Card>
  );
} 