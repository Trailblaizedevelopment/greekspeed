'use client';

import { useState, useEffect } from 'react';
import { Activity, AlertCircle, CheckCircle, Clock, Users, DollarSign, Calendar, FileText, Megaphone } from 'lucide-react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { supabase } from '@/lib/supabase/client';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';

// Use the same interface as OperationsFeed
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

export function MobileOperationsFeedPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'event' | 'announcement' | 'task' | 'document' | 'payment'>('all');
  
  const { profile } = useProfile();
  const chapterId = useScopedChapterId();
  const { enabled: eventsManagementEnabled } = useFeatureFlag('events_management_enabled');

  // Load activities on component mount
  useEffect(() => {
    if (profile?.chapter_id) {
      fetchActivities();
    }
  }, [profile?.chapter_id]);

  // Core function to fetch activities from database
  const fetchActivities = async () => {
    if (!profile?.chapter_id) return;

    try {
      setLoading(true);
      
      // Build fetch promises - conditionally include events
      const fetchPromises = [
        // Recent Events - only if events management is enabled
        ...(eventsManagementEnabled ? [
          supabase
            .from('events')
            .select('id, title, created_at, created_by')
            .eq('chapter_id', profile.chapter_id)
            .order('created_at', { ascending: false })
            .limit(20)
        ] : [Promise.resolve({ data: null, error: null })]),

        // Recent Announcements  
        supabase
          .from('announcements')
          .select(`
            id, title, created_at, sender_id,
            sender:profiles!sender_id(full_name, first_name, last_name)
          `)
          .eq('chapter_id', profile.chapter_id)
          .order('created_at', { ascending: false })
          .limit(20),

        // Recent Tasks
        supabase
          .from('tasks')
          .select(`
            id, title, status, created_at, assigned_by,
            assigner:profiles!assigned_by(full_name, first_name, last_name)
          `)
          .eq('chapter_id', profile.chapter_id)
          .order('created_at', { ascending: false })
          .limit(20),

        // Recent Documents
        supabase
          .from('documents')
          .select(`
            id, title, created_at, owner_id,
            owner:profiles!owner_id(full_name, first_name, last_name)
          `)
          .eq('chapter_id', profile.chapter_id)
          .order('created_at', { ascending: false })
          .limit(20),

        // Recent Dues Payments
        supabase
          .from('dues_assignments')
          .select(`
            id, status, amount_paid, updated_at, user_id,
            user:profiles!user_id(full_name, first_name, last_name),
            cycle:dues_cycles(name)
          `)
          .eq('cycle.chapter_id', profile.chapter_id)
          .eq('status', 'paid')
        .order('updated_at', { ascending: false })
        .limit(20)
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

      // Sort by creation date
      const sortedActivities = allActivities
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setActivities(sortedActivities);
    } catch (error) {
      console.error('Error fetching activities:', error);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper functions from OperationsFeed
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'event': return Calendar;
      case 'payment': return DollarSign;
      case 'task': return CheckCircle;
      case 'document': return FileText;
      case 'announcement': return Megaphone;
      default: return Activity;
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

  const filteredActivities = activities.filter(activity => {
    if (activeFilter === 'all') return true;
    // If events are disabled and filter is 'event', reset to 'all'
    if (activeFilter === 'event' && !eventsManagementEnabled) {
      return true;
    }
    return activity.type === activeFilter;
  });
  
  // Reset filter if events are disabled and current filter is 'event'
  useEffect(() => {
    if (activeFilter === 'event' && !eventsManagementEnabled) {
      setActiveFilter('all');
    }
  }, [activeFilter, eventsManagementEnabled]);

  const filterButtons = [
    { id: 'all' as const, label: 'All', count: activities.length },
    // Only include Events filter if events management is enabled
    ...(eventsManagementEnabled ? [{ id: 'event' as const, label: 'Events', count: activities.filter(a => a.type === 'event').length }] : []),
    { id: 'announcement' as const, label: 'Announcements', count: activities.filter(a => a.type === 'announcement').length },
    { id: 'task' as const, label: 'Tasks', count: activities.filter(a => a.type === 'task').length },
    { id: 'document' as const, label: 'Documents', count: activities.filter(a => a.type === 'document').length },
    { id: 'payment' as const, label: 'Payments', count: activities.filter(a => a.type === 'payment').length }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-4 pb-20 px-4">
        <div className="max-w-md mx-auto">
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">Loading operations...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-4 pb-20 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center space-x-2 mb-6">
          <Activity className="h-6 w-6 text-brand-primary" />
          <h1 className="text-xl font-semibold text-gray-900">Operations Feed</h1>
        </div>

        {/* Filter Buttons */}
        <div className="mb-6">
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {filterButtons.map((filter) => {
              const isActive = activeFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive 
                      ? 'bg-brand-accent text-white' 
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span>{filter.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {filter.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Operations List */}
        {filteredActivities.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg mb-2">
              {activeFilter === 'all' ? 'No operations found' : `No ${activeFilter} operations`}
            </p>
            <p className="text-gray-400 text-sm">
              {activeFilter === 'all' ? 'Operations will appear here as they happen!' : 'Try a different filter'}
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {filteredActivities.map((activity, index) => {
              const TypeIcon = getTypeIcon(activity.type);
              const ActivityIcon = activity.icon;
              return (
                <div 
                  key={activity.id} 
                  className={`px-4 py-4 ${index !== filteredActivities.length - 1 ? 'border-b border-gray-100' : ''}`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <TypeIcon className="h-5 w-5 text-brand-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-medium text-gray-900 text-sm">{activity.title}</h3>
                        <ActivityIcon className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{activity.meta}</p>
                      
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor(activity.type)}`}>
                          {getTypeLabel(activity.type)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{formatTimeAgo(activity.createdAt)}</span>
                        {activity.user && (
                          <span>By: {activity.user.full_name || `${activity.user.first_name} ${activity.user.last_name}`}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
