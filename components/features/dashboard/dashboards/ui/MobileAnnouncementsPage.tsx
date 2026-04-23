'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Clock, AlertTriangle, GraduationCap, Calendar, AlertCircle, Check, Loader2, ListTodo } from 'lucide-react';
import { useAnnouncements } from '@/lib/hooks/useAnnouncements';
import { useAnnouncementsContext } from '@/lib/contexts/AnnouncementsContext';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { Announcement } from '@/types/announcements';
import { Task, TaskStatus } from '@/types/operations';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'react-toastify';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { AnnouncementDetailDrawer } from './AnnouncementDetailDrawer';
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

export function MobileAnnouncementsPage() {
  const { profile } = useProfile();
  const chapterId = useScopedChapterId();
  const context = useAnnouncementsContext();
  const hookData = useAnnouncements(context ? null : chapterId);
  const { announcements, loading: announcementsLoading, markAsRead } = context ?? hookData;
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'tasks' | 'news'>('tasks');
  
  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'completed'>('all');
  
  // News/Announcements state
  const [newsTypeFilter, setNewsTypeFilter] = useState<'all' | 'urgent' | 'event' | 'academic' | 'general'>('all');
  // Detail drawer (same as desktop/tablet)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [markingAsRead, setMarkingAsRead] = useState<string | null>(null);

  // Load tasks for the current user
  const loadMyTasks = async () => {
    if (!profile?.chapter_id || !profile?.id) {
      setTasksLoading(false);
      return;
    }

    try {
      setTasksLoading(true);
      
      const { data: allTasks, error: fetchError } = await supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assignee_id_fkey(full_name),
          assigned_by:profiles!tasks_assigned_by_fkey(full_name),
          chapter:spaces!tasks_chapter_id_fkey(name)
        `)
        .eq('chapter_id', profile.chapter_id)
        .eq('assignee_id', profile.id)
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      const transformedTasks = (allTasks || []).map(task => ({
        ...task,
        assignee_name: task.assignee?.full_name || 'Unassigned',
        assigned_by_name: task.assigned_by?.full_name || 'Unknown',
        chapter_name: task.chapter?.name || 'Unknown Chapter',
        is_overdue: task.due_date && task.status !== 'completed' && new Date(task.due_date) < new Date()
      }));

      setTasks(transformedTasks);
    } catch (error) {
      console.error('Error loading my tasks:', error);
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'tasks') {
      loadMyTasks();
    }
  }, [profile?.chapter_id, profile?.id, activeTab]);

  const handleMarkAsRead = async (announcementId: string): Promise<void> => {
    try {
      setMarkingAsRead(announcementId);
      const success = await markAsRead(announcementId);
      if (success) {
        toast.success('Marked as read');
      }
    } catch (error) {
      console.error('Failed to mark announcement as read:', error);
      toast.error('Failed to mark as read');
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

  const handleMarkTaskComplete = async (taskId: string, currentStatus: TaskStatus) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (updateError) throw updateError;

      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, status: newStatus, is_overdue: false } : task
      ));
      
      toast.success(newStatus === 'completed' ? 'Task marked as complete!' : 'Task marked as pending');
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
    }
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    if (taskFilter === 'all') return tasks;
    return tasks.filter(t => t.status === taskFilter);
  }, [tasks, taskFilter]);

  // Filter announcements
  const filteredAnnouncements = useMemo(() => {
    if (newsTypeFilter === 'all') return announcements;
    return announcements.filter(a => a.announcement_type === newsTypeFilter);
  }, [announcements, newsTypeFilter]);

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'in_progress': return 'bg-accent-100 text-accent-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No due date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const taskFilterButtons = [
    { id: 'all' as const, label: 'All', count: tasks.length },
    { id: 'pending' as const, label: 'Pending', count: tasks.filter(t => t.status === 'pending').length },
    { id: 'completed' as const, label: 'Completed', count: tasks.filter(t => t.status === 'completed').length }
  ];

  const newsTypeFilterButtons = [
    { id: 'all' as const, label: 'All' },
    { id: 'urgent' as const, label: 'Urgent' },
    { id: 'event' as const, label: 'Event' },
    { id: 'academic' as const, label: 'Academic' },
    { id: 'general' as const, label: 'General' }
  ];

  if (announcementsLoading && activeTab === 'news') {
    return (
      <div className="min-h-screen bg-gray-50 pt-4 pb-20 px-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
            <span className="ml-2 text-gray-600">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-0 pb-20 px-4">
      <div className="max-w-md mx-auto">
        {/* Tabs - minimal style, tight spacing under header */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-2 h-11 bg-transparent p-0 rounded-none border-b border-gray-200">
            <TabsTrigger
              value="tasks"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none text-gray-500 data-[state=active]:bg-transparent bg-transparent"
            >
              Tasks
            </TabsTrigger>
            <TabsTrigger
              value="news"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none text-gray-500 data-[state=active]:bg-transparent bg-transparent"
            >
              News
            </TabsTrigger>
          </TabsList>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-4 mt-2">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
              </div>
            ) : filteredTasks.length === 0 ? (
              <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                <CardContent className="p-8 text-center">
                  <ListTodo className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-slate-700 text-lg mb-2">
                    {taskFilter === 'all' ? 'No tasks found' : `No ${taskFilter} tasks`}
                  </p>
                  <p className="text-slate-600 text-sm">
                    {taskFilter === 'all' ? "You're all caught up! 🎉" : 'Try a different filter'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Filter Buttons */}
                <div className="-mx-4 px-4">
                  <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
                    {taskFilterButtons.map((filter) => {
                      const isActive = taskFilter === filter.id;
                      return (
                        <button
                          key={filter.id}
                          onClick={() => setTaskFilter(filter.id)}
                          className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
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

                {/* Tasks List */}
                <div className="space-y-2">
                  {filteredTasks.map((task) => (
                    <Card key={task.id} className="p-3 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <h3 className="font-medium text-slate-900 text-sm flex-1">{task.title}</h3>
                          <div className="flex space-x-2 ml-2">
                            <Badge className={getStatusColor(task.status)}>
                              {task.status}
                            </Badge>
                            <Badge className={getPriorityColor(task.priority)}>
                              {task.priority}
                            </Badge>
                          </div>
                        </div>
                        
                        {task.description && (
                          <p className="text-xs text-slate-700">{task.description}</p>
                        )}
                        
                        <div className="space-y-1 text-xs text-slate-700">
                          <div className="flex items-center space-x-2">
                            <Clock className="h-3 w-3" />
                            <span className={task.is_overdue ? 'text-red-600 font-medium' : ''}>
                              Due: {formatDate(task.due_date)}
                            </span>
                            {task.is_overdue && (
                              <AlertCircle className="h-3 w-3 text-red-600" />
                            )}
                          </div>
                          {task.assigned_by_name && (
                            <div className="flex items-center space-x-2">
                              <span>Assigned by: {task.assigned_by_name}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex space-x-2 pt-2 border-t border-gray-100">
                          <Button
                            size="sm"
                            onClick={() => handleMarkTaskComplete(task.id, task.status)}
                            className="h-7 px-3 text-xs flex-1 rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                            variant="outline"
                          >
                            <Check className="h-3 w-3 mr-1" />
                            {task.status === 'completed' ? 'Mark Pending' : 'Mark Complete'}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* News Tab */}
          <TabsContent value="news" className="space-y-4 mt-2">
            {/* Filter Buttons */}
            <div className="-mx-4 px-4">
              <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
                {newsTypeFilterButtons.map((filter) => {
                  const isActive = newsTypeFilter === filter.id;
                  const count = filter.id === 'all' 
                    ? announcements.length 
                    : announcements.filter(a => a.announcement_type === filter.id).length;
                  
                  return (
                    <button
                      key={filter.id}
                      onClick={() => setNewsTypeFilter(filter.id)}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                        isActive 
                          ? 'bg-brand-accent text-white' 
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span>{filter.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Announcements List */}
            {filteredAnnouncements.length === 0 ? (
              <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                <CardContent className="p-8 text-center">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-slate-700 text-lg mb-2">No new announcements</p>
                  <p className="text-slate-600 text-sm">You're all caught up!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredAnnouncements.map((announcement) => {
                  const typeConfig = getAnnouncementTypeConfig(announcement.announcement_type);
                  const TypeIcon = typeConfig.icon;
                  const primaryLink = getPrimaryLinkFromMetadata(announcement.metadata);

                  return (
                    <Card
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
                      className="p-3 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 cursor-pointer active:scale-[0.99]"
                      aria-label={`View announcement: ${announcement.title}`}
                    >
                      <div className="flex items-start space-x-3">
                        {/* Type icon */}
                        <div className={`w-8 h-8 ${typeConfig.bgColor} rounded-full flex items-center justify-center shrink-0`}>
                          <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Header with title */}
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-medium text-slate-900 text-sm line-clamp-2 break-words">
                              {announcement.title}
                            </h4>
                          </div>

                          {primaryLink && (
                            <AnnouncementPrimaryLinkDisplay link={primaryLink} variant="compact" />
                          )}

                          {/* Content preview */}
                          <p className="text-xs text-slate-700 mb-3 line-clamp-2 break-words">
                            {announcement.content}
                          </p>

                          {/* Footer with sender and time - tap card to open drawer for full content and Mark as read */}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <span className="break-words">
                              {announcement.sender?.full_name || 'Unknown'}
                            </span>
                            <span className="text-slate-500">
                              {formatRelativeTime(announcement.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AnnouncementDetailDrawer
        announcement={selectedAnnouncement}
        isOpen={showDetailDrawer}
        onClose={closeDetailDrawer}
        onMarkAsRead={async (id) => {
          try {
            await handleMarkAsRead(id);
            closeDetailDrawer();
          } catch {
            // Error already handled in handleMarkAsRead; keep drawer open
          }
        }}
        markingAsRead={markingAsRead}
      />
    </div>
  );
}
