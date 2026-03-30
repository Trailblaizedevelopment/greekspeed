'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, CheckCircle, Crown, Settings, Clock, UserCheck, DollarSign, TrendingUp, Calendar, BookOpen, Loader2 } from 'lucide-react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useChapterBudget } from '@/lib/hooks/useChapterBudget';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, UserPlus, Users as UsersIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Megaphone, Send, Mail, Smartphone } from 'lucide-react';
import { useAnnouncements } from '@/lib/hooks/useAnnouncements';
import { CreateAnnouncementData } from '@/types/announcements';
import { toast } from 'react-toastify';
import { useAuth } from '@/lib/supabase/auth-context';
import { ChapterDocumentManager } from '../ChapterDocumentManager';
import { createPortal } from 'react-dom';
import { EventForm } from '@/components/ui/EventForm';
import { useEvents } from '@/lib/hooks/useEvents';
import { CreateEventRequest, UpdateEventRequest } from '@/types/events';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { isPublishedEventUpcoming } from '@/lib/utils/eventScheduleDisplay';
import { useAnnouncementImageAttachment } from '@/lib/hooks/useAnnouncementImageAttachment';
import { AnnouncementImageAttachmentField } from '../AnnouncementImageAttachmentField';

interface OverviewViewProps {
  selectedRole: string;
  onFeatureChange?: (feature: 'members' | 'dues' | 'budget' | 'invitations' | 'events' | 'tasks' | 'overview') => void;
}

export function OverviewView({ selectedRole, onFeatureChange }: OverviewViewProps) {
  const { profile } = useProfile();
  const { session } = useAuth();
  const chapterId = useScopedChapterId();
  const router = useRouter();
  const { startingBudget } = useChapterBudget();
  const { enabled: eventsManagementEnabled } = useFeatureFlag('events_management_enabled');
  
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [activeMemberCount, setActiveMemberCount] = useState<number | null>(null);
  const [alumniCount, setAlumniCount] = useState<number | null>(null);
  const [totalTasks, setTotalTasks] = useState<number>(0);
  const [completedTasks, setCompletedTasks] = useState<number>(0);
  const [pendingTasks, setPendingTasks] = useState<number>(0);
  const [compliance, setCompliance] = useState<number>(0);
  const [eventBudget, setEventBudget] = useState<number>(0);
  const [upcomingEvents, setUpcomingEvents] = useState<number>(0);
  const [totalAttendees, setTotalAttendees] = useState<number>(0);
  const [vendorCount, setVendorCount] = useState<number>(0);

  // Announcement form state
  const { createAnnouncement, loading: announcementsLoading } = useAnnouncements(chapterId || null);
  const [announcement, setAnnouncement] = useState("");
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementType, setAnnouncementType] = useState<'general' | 'urgent' | 'event' | 'academic'>('general');
  const [sendSmsToMembers, setSendSmsToMembers] = useState(false);
  const [sendSmsToAlumni, setSendSmsToAlumni] = useState(false);
  const [sendEmailToMembers, setSendEmailToMembers] = useState(false);
  const [sendEmailToAlumni, setSendEmailToAlumni] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailRecipientCount, setEmailRecipientCount] = useState<number | null>(null);
  const [alumniEmailRecipientCount, setAlumniEmailRecipientCount] = useState<number | null>(null);
  const [memberSmsRecipientCount, setMemberSmsRecipientCount] = useState<number | null>(null);
  const [alumniSmsRecipientCount, setAlumniSmsRecipientCount] = useState<number | null>(null);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const {
    pendingImage,
    imageAlt,
    setImageAlt,
    imageUploading,
    handleFileChange,
    processImageFile,
    removeImage,
    resetAttachment,
    buildMetadata,
    acceptTypes,
  } = useAnnouncementImageAttachment();

  // Event form state
  const [showEventForm, setShowEventForm] = useState(false);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  const [loadingCounts, setLoadingCounts] = useState(true);

  // Events hook for creating events
  const { createEvent } = useEvents({ 
    chapterId: chapterId || '', 
    scope: 'all' 
  });

  useEffect(() => {
    if (chapterId) {
      fetchOverviewData();
    }
  }, [chapterId, selectedRole]);

  useEffect(() => {
    // Preserve existing behavior: urgent auto-enables member SMS
    setSendSmsToMembers(announcementType === 'urgent');
    // Alumni SMS starts as opt-in per announcement
    setSendSmsToAlumni(false);
  }, [announcementType]);

  useEffect(() => {
    const fetchRecipientCounts = async () => {
      if (!chapterId || !session?.access_token) return;
      
      setLoadingRecipients(true);
      try {
        const response = await fetch(
          `/api/announcements/recipient-counts?chapter_id=${chapterId}`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          setEmailRecipientCount(data.email_recipients);
          setMemberSmsRecipientCount(data.sms_recipients);
          setAlumniSmsRecipientCount(
            typeof data.alumni_sms_recipients === 'number'
              ? data.alumni_sms_recipients
              : null
          );
          setAlumniEmailRecipientCount(
            typeof data.alumni_email_recipients === 'number'
              ? data.alumni_email_recipients
              : null
          );
        }
      } catch (error) {
        console.error('Error fetching recipient counts:', error);
      } finally {
        setLoadingRecipients(false);
      }
    };

    fetchRecipientCounts();
  }, [chapterId, session?.access_token]);

  const handleSendAnnouncement = async () => {
    if (!announcementTitle.trim() || !announcement.trim()) {
      toast.error('Please fill in both title and content');
      return;
    }

    setIsSubmitting(true);
    try {
      const announcementData: CreateAnnouncementData = {
        title: announcementTitle.trim(),
        content: announcement.trim(),
        announcement_type: announcementType,
        send_sms: sendSmsToMembers,
        send_sms_to_alumni: sendSmsToAlumni,
        send_email_to_members: sendEmailToMembers,
        send_email_to_alumni: sendEmailToAlumni,
        metadata: buildMetadata(),
      };

      await createAnnouncement(announcementData);
      
      // Reset form
      setAnnouncement("");
      setAnnouncementTitle("");
      setAnnouncementType('general');
      setSendSmsToMembers(false);
      setSendSmsToAlumni(false);
      setSendEmailToMembers(false);
      setSendEmailToAlumni(false);
      resetAttachment();
      
      toast.success('Announcement sent successfully!');
    } catch (error) {
      toast.error('Failed to send announcement');
      console.error('Error sending announcement:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateEvent = async (eventData: CreateEventRequest | UpdateEventRequest) => {
    if (!chapterId) {
      toast.error('Chapter ID is required');
      return;
    }

    setIsSubmittingEvent(true);
    try {
      await createEvent({
        ...eventData,
        created_by: profile?.id || 'system',
        updated_by: profile?.id || 'system'
      } as CreateEventRequest);
      
      setShowEventForm(false);
      toast.success('Event created successfully!');
    } catch (error) {
      toast.error('Failed to create event');
      console.error('Error creating event:', error);
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const fetchOverviewData = async () => {
    setLoadingCounts(true);

    // Fetch member stats
    try {
      const memberResponse = await fetch(`/api/chapter/member-count?chapter_id=${chapterId}`);
      if (memberResponse.ok) {
        const data = await memberResponse.json();
        setMemberCount(data.count);
      }
    } catch (error) {
      console.error('Error fetching member count:', error);
    }

    try {
      const activeResponse = await fetch(`/api/chapter/active-member-count?chapter_id=${chapterId}`);
      if (activeResponse.ok) {
        const data = await activeResponse.json();
        setActiveMemberCount(data.count);
      }
    } catch (error) {
      console.error('Error fetching active member count:', error);
    }

    try {
      const alumniResponse = await fetch(`/api/chapter/alumni-count?chapter_id=${chapterId}`);
      if (alumniResponse.ok) {
        const data = await alumniResponse.json();
        setAlumniCount(data.count);
      }
    } catch (error) {
      console.error('Error fetching alumni count:', error);
    }

    // Fetch task stats for VP
    if (selectedRole === 'vice-president') {
      try {
        const response = await fetch(`/api/tasks?chapter_id=${chapterId}`);
        if (response.ok) {
          const tasks = await response.json();
          const total = tasks.length || 0;
          const completed = tasks.filter((t: any) => t.status === 'completed').length || 0;
          const pending = tasks.filter((t: any) => t.status === 'pending').length || 0;
          setTotalTasks(total);
          setCompletedTasks(completed);
          setPendingTasks(pending);
          setCompliance(total > 0 ? Math.round((completed / total) * 100 * 10) / 10 : 0);
        }
      } catch (error) {
        console.error('Error fetching tasks:', error);
      }
    }

    // Fetch event/budget stats for Social Chair - only if events management is enabled
    if (selectedRole === 'social-chair' && eventsManagementEnabled) {
      try {
        const response = await fetch(`/api/events?chapter_id=${chapterId}&scope=all`);
        if (response.ok) {
          const events = await response.json();
          const nowIso = new Date().toISOString();
          const upcoming = events.filter(
            (e: any) => e.status === 'published' && isPublishedEventUpcoming(e, nowIso)
          );
          setUpcomingEvents(upcoming.length);
          
          const eventsWithBudget = events.filter((e: any) => e.budget_amount && parseFloat(String(e.budget_amount)) > 0);
          const totalAllocated = eventsWithBudget.reduce((sum: number, e: any) => sum + parseFloat(String(e.budget_amount || '0')), 0);
          const remaining = startingBudget - totalAllocated; // Starting budget
          setEventBudget(remaining);
          
          const attendees = upcoming.reduce((sum: number, e: any) => sum + (e.attendee_count || 0), 0);
          setTotalAttendees(attendees);
        }
      } catch (error) {
        console.error('Error fetching events:', error);
      }
    } else if (selectedRole === 'social-chair' && !eventsManagementEnabled) {
      // Reset event stats when events are disabled
      setUpcomingEvents(0);
      setEventBudget(startingBudget);
      setTotalAttendees(0);
    }

    try {
      const response = await fetch(`/api/vendors?chapter_id=${chapterId}`);
      if (response.ok) {
        const vendors = await response.json();
        setVendorCount(vendors.length || 0);
      }
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }

    setLoadingCounts(false);
  };

  const getStatsCards = () => {
    switch (selectedRole) {
      case 'president':
        return [
          { 
            label: 'Total Members', 
            value: loadingCounts ? null : (memberCount ?? 0), 
            icon: Users, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
          { 
            label: 'Active Members', 
            value: loadingCounts ? null : (activeMemberCount ?? 0), 
            icon: CheckCircle, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
          { 
            label: 'Alumni', 
            value: loadingCounts ? null : (alumniCount ?? 0), 
            icon: Crown, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
        ];
      
      case 'vice-president':
        return [
          { 
            label: 'Total Tasks', 
            value: totalTasks, 
            icon: Settings, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
          { 
            label: 'Completed', 
            value: completedTasks, 
            icon: CheckCircle, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
          { 
            label: 'Pending', 
            value: pendingTasks, 
            icon: Clock, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
          { 
            label: 'Compliance', 
            value: `${compliance}%`, 
            icon: UserCheck, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
        ];
      
      case 'social-chair':
        return [
          { 
            label: 'Event Budget', 
            value: `$${eventBudget.toLocaleString()}`, 
            icon: DollarSign, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
          { 
            label: 'Upcoming Events', 
            value: upcomingEvents, 
            icon: Calendar, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
          { 
            label: 'Total Attendees', 
            value: totalAttendees, 
            icon: Users, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
          { 
            label: 'Vendor Contacts', 
            value: vendorCount, 
            icon: BookOpen, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
        ];
      
      case 'treasurer':
        return [
          { 
            label: 'Total Members', 
            value: loadingCounts ? null : (memberCount ?? 0), 
            icon: Users, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
          { 
            label: 'Active Members', 
            value: loadingCounts ? null : (activeMemberCount ?? 0), 
            icon: CheckCircle, 
            color: 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20', 
            textColor: 'text-brand-primary-hover',
            iconColor: 'text-brand-primary'
          },
        ];
      
      default:
        return [];
    }
  };

  const getQuickActions = () => {
    const baseActions = [
      // Only include Create Event if events management is enabled
      ...(eventsManagementEnabled ? [{
        id: 'create-event',
        label: 'Create Event',
        icon: CalendarIcon,
        onClick: () => setShowEventForm(true),
      }] : []),
      {
        id: 'budget',
        label: 'Budget',
        icon: TrendingUp,
        onClick: () => onFeatureChange?.('budget'),
      },
    ];

    if (selectedRole === 'president' || selectedRole === 'vice-president') {
      baseActions.push({
        id: 'manage-members',
        label: 'Members',
        icon: UsersIcon,
        onClick: () => onFeatureChange?.('members'),
      });
    }

    if (selectedRole === 'president') {
      baseActions.push({
        id: 'manage-invitations',
        label: 'Invitations',
        icon: UserPlus,
        onClick: () => onFeatureChange?.('invitations'),
      });
    }

    return baseActions;
  };

  const statsCards = getStatsCards();
  const quickActions = getQuickActions();

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card 
              key={index} 
              className={`${stat.color} transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90`}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${stat.textColor} text-sm font-medium mb-1`}>{stat.label}</p>
                    {stat.value === null ? (
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
                      </div>
                    ) : (
                      <p className={`text-2xl font-semibold ${stat.textColor.replace('700', '900')}`}>
                        {typeof stat.value === 'string' ? stat.value : stat.value.toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Icon className={`h-8 w-8 ${stat.iconColor}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Announcements and Quick Actions - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-h-[500px]">
        {/* Announcements Card - Left side, 3/4 width */}
        <Card className="w-full lg:col-span-3 flex flex-col max-h-[500px] bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
          <CardHeader className="pb-3 flex-shrink-0 border-b border-primary-100/30">
            <CardTitle className="flex items-center space-x-2">
              <Megaphone className="h-5 w-5 text-brand-primary" />
              <span className="text-primary-900">Chapter Announcements</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                placeholder="Announcement title..."
                value={announcementTitle}
                onChange={(e) => setAnnouncementTitle(e.target.value)}
                className="md:col-span-2"
              />
              <Select 
                value={announcementType} 
                onValueChange={(value: string) => setAnnouncementType(value as 'general' | 'urgent' | 'event' | 'academic')}
              >
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="academic">Academic</SelectItem>
              </Select>
            </div>
            
            <Textarea
              placeholder="Write a chapter announcement..."
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              className="min-h-[100px]"
            />

            <AnnouncementImageAttachmentField
              idSuffix="overview"
              pendingImage={pendingImage}
              imageAlt={imageAlt}
              onAltChange={setImageAlt}
              imageUploading={imageUploading}
              acceptTypes={acceptTypes}
              onFileChange={handleFileChange}
              processImageFile={processImageFile}
              onRemove={removeImage}
              disabled={isSubmitting || announcementsLoading}
            />
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex flex-col space-y-3 flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Delivery Options
                </p>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="send-sms-members"
                      checked={sendSmsToMembers}
                      onCheckedChange={(checked) => setSendSmsToMembers(checked as boolean)}
                    />
                    <Label htmlFor="send-sms-members" className="text-sm cursor-pointer flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5 text-gray-500" />
                      SMS to Actives
                      {memberSmsRecipientCount !== null && (
                        <span className="text-xs text-gray-500 font-normal">({memberSmsRecipientCount})</span>
                      )}
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="send-sms-alumni"
                      checked={sendSmsToAlumni}
                      onCheckedChange={(checked) => setSendSmsToAlumni(checked as boolean)}
                    />
                    <Label htmlFor="send-sms-alumni" className="text-sm cursor-pointer flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5 text-gray-500" />
                      SMS to Alumni
                      {alumniSmsRecipientCount !== null && (
                        <span className="text-xs text-gray-500 font-normal">({alumniSmsRecipientCount})</span>
                      )}
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="send-email-members"
                      checked={sendEmailToMembers}
                      onCheckedChange={(checked) => setSendEmailToMembers(checked as boolean)}
                    />
                    <Label htmlFor="send-email-members" className="text-sm cursor-pointer flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-gray-500" />
                      Email to Actives
                      {emailRecipientCount !== null && (
                        <span className="text-xs text-gray-500 font-normal">({emailRecipientCount})</span>
                      )}
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="send-email-alumni"
                      checked={sendEmailToAlumni}
                      onCheckedChange={(checked) => setSendEmailToAlumni(checked as boolean)}
                    />
                    <Label htmlFor="send-email-alumni" className="text-sm cursor-pointer flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-gray-500" />
                      Email to Alumni
                      {alumniEmailRecipientCount !== null && (
                        <span className="text-xs text-gray-500 font-normal">({alumniEmailRecipientCount})</span>
                      )}
                    </Label>
                  </div>
                </div>
                
                {loadingRecipients && (
                  <p className="text-xs text-gray-400 pl-6">Loading recipient counts...</p>
                )}
              </div>
              
              <Button 
                className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 w-full md:w-auto transition-all duration-300"
                onClick={handleSendAnnouncement}
                disabled={isSubmitting || announcementsLoading}
              >
                <Send className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Sending...' : 'Send Announcement'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions - Right side, 1/4 width */}
        <Card className="w-full lg:col-span-1 flex flex-col max-h-[500px] bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
          <CardHeader className="pb-3 flex-shrink-0 border-b border-primary-100/30">
            <CardTitle className="text-lg font-semibold text-primary-900">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex-1 overflow-y-auto">
            <div className="space-y-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    variant="outline"
                    className="w-full justify-start text-sm whitespace-nowrap rounded-full bg-white/80 backdrop-blur-md border border-primary-300/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                    onClick={action.onClick}
                  >
                    <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{action.label}</span>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chapter Documents Section */}
      {chapterId && (
        <ChapterDocumentManager 
          chapterId={chapterId} 
          className="w-full"
        />
      )}

      {/* Event Form Modal - Only show if events management is enabled */}
      {showEventForm && eventsManagementEnabled && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="relative max-w-2xl w-full max-h-[90vh]">
            <EventForm
              event={null}
              onSubmit={handleCreateEvent}
              onCancel={() => setShowEventForm(false)}
              loading={isSubmittingEvent}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

