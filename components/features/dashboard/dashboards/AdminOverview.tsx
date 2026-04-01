'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { QuickActions, QuickAction } from './ui/QuickActions';
import { DuesSnapshot } from './ui/DuesSnapshot';
import { ComplianceSnapshot } from './ui/ComplianceSnapshot';
import { OperationsFeed } from './ui/OperationsFeed';
import { EventsPanel } from './ui/EventsPanel';
import { TasksPanel } from './ui/TasksPanel';
import { DocsCompliancePanel } from './ui/DocsCompliancePanel';
import { AlertsStrip } from './ui/AlertsStrip';
import { CalendarEventsWeekCard } from './ui/CalendarEventsWeekCard';
import { Event } from '@/types/events';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { SocialFeed, type SocialFeedInitialData } from './ui/SocialFeed';
import { DuesStatusCard } from './ui/DuesStatusCard';
import { FeatureGuard } from '@/components/shared/FeatureGuard';
import { MobileBottomNavigation } from './ui/MobileBottomNavigation'; // Changed import
import { MobileAdminTasksPage } from './ui/MobileAdminTasksPage';
import { MobileDocsCompliancePage } from './ui/MobileDocsCompliancePage';
import { MobileOperationsFeedPage } from './ui/MobileOperationsFeedPage';
import { MobileCalendarPage } from './ui/MobileCalendarPage';
import { MobileOperationsPage } from './ui/MobileOperationsPage';
import { MobileEventsVendorsPage } from './ui/MobileEventsVendorsPage';
import { Calendar, Users, UserPlus, Home, Wrench, CheckSquare, FileText, Activity, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventForm } from '@/components/ui/EventForm';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { createPortal } from 'react-dom';
import { SendAnnouncementButton } from './ui/SendAnnouncementButton';
import { EXECUTIVE_ROLES } from '@/lib/permissions';
import { UpcomingEventsCard } from './ui/UpcomingEventsCard';
import { cn } from '@/lib/utils';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { AddRecruitForm } from '@/components/features/recruitment/AddRecruitForm';
import type { Recruit } from '@/types/recruitment';

interface AdminOverviewProps {
  initialFeed?: SocialFeedInitialData;
  fallbackChapterId?: string | null;
}

export function AdminOverview({ initialFeed, fallbackChapterId }: AdminOverviewProps) {
  const { profile, isDeveloper } = useProfile();
  const isGovernance = profile?.role === 'governance';
  // Developers and governance can "view as" another chapter via ChapterSwitcher (fallbackChapterId = effective chapter).
  // Prefer fallbackChapterId so feed and sidebars reflect the selected chapter.
  const chapterId = (isDeveloper || isGovernance ? (fallbackChapterId ?? profile?.chapter_id) : (profile?.chapter_id ?? fallbackChapterId)) ?? null;
  const [activeMobileTab, setActiveMobileTab] = useState('home');
  const [showQuickActionsModal, setShowQuickActionsModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showAddRecruitModal, setShowAddRecruitModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false); // Add this line

  const router = useRouter();
  const searchParams = useSearchParams();
  const { enabled: eventsManagementEnabled } = useFeatureFlag('events_management_enabled');
  const { enabled: recruitmentCrmEnabled } = useFeatureFlag('recruitment_crm_enabled');

  // Add mobile detection useEffect (add this after line 46, before feedData)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ---- Shared events fetch (eliminates duplicate API call) ----
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const fetchAllEvents = useCallback(async () => {
    if (!chapterId || !profile?.id) return;
    try {
      setEventsLoading(true);
      setEventsError(null);
      // Single call with scope=all AND user_id — covers tablet UpcomingEventsCard (desktop uses CalendarEventsWeekCard mock for now)
      const response = await fetch(
        `/api/events?chapter_id=${chapterId}&scope=all&user_id=${profile.id}`
      );
      if (!response.ok) throw new Error('Failed to fetch events');
      const data: Event[] = await response.json();
      setAllEvents(data);
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setEventsLoading(false);
    }
  }, [chapterId, profile?.id]);

  useEffect(() => {
    fetchAllEvents();
  }, [fetchAllEvents]);

  // Handle tool query param from FAB menu
  useEffect(() => {
    const tool = searchParams.get('tool');
    const tab = searchParams.get('tab');

    if (tool === 'tasks') {
      setActiveMobileTab('tasks');
      // If tab=recruits is in query, we'll handle it in MobileAdminTasksPage
    } else if (tool === 'operations') {
      setActiveMobileTab('operations');
    } else if (tool === 'events') {
      setActiveMobileTab('events');
    } else if (tool === 'invites') {
      // Navigate to events tab which renders MobileEventsVendorsPage
      // The tab parameter will be handled by MobileEventsVendorsPage
      setActiveMobileTab('events');
    } else if (tool === 'docs') {
      setActiveMobileTab('docs');
    } else if (tool === 'ops') {
      setActiveMobileTab('ops');
    } else if (tool === 'calendar') {
      setActiveMobileTab('calendar');
    } else if (!tool) {
      setActiveMobileTab('home');
    }
  }, [searchParams]);

  // Quick Actions handlers
  const handleScheduleMeeting = () => {
    setShowEventModal(true);
  };

  const handleCreateEvent = async (eventData: any) => {
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...eventData,
          chapter_id: chapterId,
          created_by: profile?.id || 'system',
          updated_by: profile?.id || 'system',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create event');
      }

      toast.success('Event created successfully!');
      setShowEventModal(false);
    } catch (error) {
      toast.error('Failed to create event');
      console.error('Error creating event:', error);
    }
  };

  const handleAddRecruit = () => {
    setShowAddRecruitModal(true);
  };

  const handleRecruitSuccess = (recruit: Recruit) => {
    toast.success('Recruit added successfully!');
    setShowAddRecruitModal(false);
  };

  const handleRecruitCancel = () => {
    setShowAddRecruitModal(false);
  };

  // Define quickActions array for the admin dashboard
  const quickActions: QuickAction[] = [
    // Only include Create Event if events management is enabled
    ...(eventsManagementEnabled ? [{
      id: 'create-event',
      label: 'Create Event',
      icon: Calendar,
      onClick: handleScheduleMeeting,
      variant: 'outline' as const,
    }] : []),
    {
      id: 'manage-members',
      label: 'Manage Members',
      icon: Users,
      onClick: () => router.push('/dashboard/admin/members'),
      variant: 'outline' as const,
    },
    {
      id: 'view-invitations',
      label: 'View Invitations',
      icon: UserPlus,
      onClick: () => {
        router.push('/dashboard?tool=invites&tab=invitations');
      },
      variant: 'outline' as const,
    },
    // Add recruitment option conditionally based on flag
    ...(recruitmentCrmEnabled ? [{
      id: 'add-recruit',
      label: 'Add Recruit',
      icon: UserPlus,
      onClick: handleAddRecruit,
      variant: 'outline' as const,
    }] : []),
  ];

  // Remove the manual tab configuration - MobileBottomNavigation will auto-detect role

  // Check if user is an executive member
  const isExecutiveMember = profile?.role === 'admin' ||
    (profile?.chapter_role && EXECUTIVE_ROLES.includes(profile.chapter_role as any));

  const renderMobileContent = () => {
    switch (activeMobileTab) {
      case 'home':
        return (
          <div className="space-y-2 sm:space-y-4">
            <div className="w-full">
              {/* Show Send Announcement for executive members, DuesStatusCard for others */}
              {isExecutiveMember ? (
                <SendAnnouncementButton />
              ) : (
                <FeatureGuard flagName="financial_tools_enabled">
                  <DuesStatusCard />
                </FeatureGuard>
              )}
            </div>
            <div className="w-full">
              <SocialFeed chapterId={chapterId || ''} initialData={initialFeed} />
            </div>
          </div>
        );
      case 'tasks':
        return <MobileAdminTasksPage />;
      case 'operations':
        return <MobileOperationsPage />;
      case 'events':
        return <MobileEventsVendorsPage />;
      case 'docs':
        return <MobileDocsCompliancePage />;
      case 'ops':
        return <MobileOperationsFeedPage />;
      case 'calendar':
        return <MobileCalendarPage />;
      default:
        return (
          <div className="space-y-4">
            <div className="w-full">
              <SocialFeed chapterId={chapterId || ''} initialData={initialFeed} />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Alerts Strip - Critical alerts only */}
      <div className="max-w-full mx-auto px-4 sm:px-6 py-2">
        <AlertsStrip />
      </div>

      {/* Main Content - Mobile-First Layout */}
      <div className="max-w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* Mobile Layout: Tab-Based Navigation */}
        <div className="sm:hidden">
          {renderMobileContent()}
        </div>

        {/* Tablet Layout (sm to lg): Two Column - Feed + Right Sidebar */}
        <div className="hidden sm:grid lg:hidden grid-cols-12 gap-4">
          {/* Main Content - Social Feed (takes ~70%) */}
          <div className="col-span-8">
            <SocialFeed chapterId={chapterId || ''} initialData={initialFeed} />
          </div>

          {/* Right Sidebar - Events & Key Info (~30%) */}
          <div className="col-span-4">
            <div className="space-y-4">
              <FeatureGuard flagName="events_management_enabled">
                <UpcomingEventsCard
                  chapterId={chapterId}
                  userId={profile?.id}
                  events={allEvents}
                  loading={eventsLoading}
                  error={eventsError}
                  onRetry={fetchAllEvents}
                />
              </FeatureGuard>
              {chapterId && <TasksPanel chapterId={chapterId} />}
              {/* Include DuesStatusCard on tablet since left sidebar is hidden */}
              <FeatureGuard flagName="financial_tools_enabled">
                <DuesStatusCard />
              </FeatureGuard>
              {/* Add DocsCompliancePanel for tablet view */}
              <DocsCompliancePanel />
            </div>
          </div>
        </div>

        {/* Desktop Layout (lg+): Three Column Grid */}
        <div className="hidden lg:grid lg:grid-cols-12 lg:gap-6">
          {/* Center Column - 6 columns wide (RENDER FIRST for faster paint) */}
          <div className="col-span-6 col-start-4 space-y-6">
            <SocialFeed chapterId={chapterId || ''} initialData={initialFeed} />
          </div>

          {/* Left Column - 3 columns wide */}
          <div className="col-span-3 col-start-1 row-start-1 space-y-6">
            <FeatureGuard flagName="financial_tools_enabled">
              <DuesStatusCard />
            </FeatureGuard>
            <OperationsFeed />
          </div>

          {/* Right Column - 3 columns wide */}
          <div className="col-span-3 col-start-10 row-start-1 space-y-6">
            <FeatureGuard flagName="events_management_enabled">
              <CalendarEventsWeekCard />
            </FeatureGuard>
            {chapterId && <TasksPanel chapterId={chapterId} />}
            <DocsCompliancePanel />
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation - Auto-configures based on admin role */}
      <MobileBottomNavigation
        activeTab={activeMobileTab}
        onTabChange={setActiveMobileTab}
      />

      {/* Quick Actions Floating Action Button - Only on Home Page */}
      {activeMobileTab === 'home' && (
        <div
          onClick={() => setShowQuickActionsModal(true)}
          className="fixed bottom-40 right-4 z-40 h-14 w-14 rounded-full sm:hidden flex items-center justify-center cursor-pointer group bg-brand-primary hover:bg-brand-primary-hover transition-colors"
          style={{
            boxShadow: `
              0 8px 16px rgba(0, 0, 0, 0.25),
              0 4px 8px rgba(0, 0, 0, 0.15),
              inset 0 1px 0 rgba(255, 255, 255, 0.3),
              inset 0 -1px 0 rgba(0, 0, 0, 0.2)
            `,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
          title="Quick Actions"
        >
          {/* Inner glow effect */}
          <div
            className="absolute inset-0 rounded-full opacity-40"
            style={{
              background: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4), transparent 70%)',
            }}
          />
          {/* Icon */}
          <svg
            className="h-6 w-6 text-white relative z-10 drop-shadow-lg transition-transform duration-200 group-hover:scale-110"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{
              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4))',
            }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {/* Hover shine effect */}
          <div
            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: 'radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.3), transparent 60%)',
            }}
          />
        </div>
      )}

      {/* Quick Actions Modal - Mobile: Bottom drawer, Desktop: Centered */}
      {showQuickActionsModal && (
        <div className={cn(
          "fixed inset-0 z-[9999]",
          isMobile
            ? "flex items-end justify-center p-0 sm:hidden"
            : "hidden sm:flex items-center justify-center p-4"
        )}>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setShowQuickActionsModal(false)}
          />

          {/* Mobile: Bottom Drawer - EDIT HERE FOR UPDATE LATER */}
          {isMobile && (
            <div className="relative bg-white shadow-xl w-full flex flex-col max-h-[85dvh] mt-[15dvh] rounded-t-2xl rounded-b-none pb-[calc(25px+env(safe-area-inset-bottom))]">
              {/* Header */}
              <div className="flex items-center justify-between p-4 flex-shrink-0 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
                <button
                  onClick={() => setShowQuickActionsModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-4 pb-[calc(25px+env(safe-area-inset-bottom))]">
                <div className="space-y-3">
                  {eventsManagementEnabled && (
                    <Button
                      variant="outline"
                      className="w-full justify-start rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                      onClick={() => {
                        handleScheduleMeeting();
                        setShowQuickActionsModal(false);
                      }}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Create Event
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="w-full justify-start rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                    onClick={() => {
                      router.push('/dashboard?tool=operations&tab=members');
                      setShowQuickActionsModal(false);
                    }}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Manage Members
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                    onClick={() => {
                      router.push('/dashboard?tool=invites&tab=invitations');
                      setShowQuickActionsModal(false);
                    }}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    View Invitations
                  </Button>
                  {recruitmentCrmEnabled && (
                    <>
                      <Button
                        variant="outline"
                        className="w-full justify-start rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                        onClick={() => {
                          handleAddRecruit();
                          setShowQuickActionsModal(false);
                        }}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Recruit
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                        onClick={() => {
                          router.push('/dashboard?tool=tasks&tab=recruits');
                          setShowQuickActionsModal(false);
                        }}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Manage Recruits
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Desktop: Centered Modal */}
          {!isMobile && (
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
                  <button
                    onClick={() => setShowQuickActionsModal(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* Quick Actions Content */}
                <div className="space-y-3">
                  {eventsManagementEnabled && (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        handleScheduleMeeting();
                        setShowQuickActionsModal(false);
                      }}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Create Event
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      router.push('/dashboard?tool=operations&tab=members');
                      setShowQuickActionsModal(false);
                    }}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Manage Members
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      router.push('/dashboard?tool=invites&tab=invitations');
                      setShowQuickActionsModal(false);
                    }}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    View Invitations
                  </Button>
                  {recruitmentCrmEnabled && (
                    <>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          handleAddRecruit();
                          setShowQuickActionsModal(false);
                        }}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Recruit
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          router.push('/dashboard?tool=tasks&tab=recruits');
                          setShowQuickActionsModal(false);
                        }}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Manage Recruits
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Recruit Modal - Mobile: Bottom drawer, Desktop: Centered */}
      {showAddRecruitModal && recruitmentCrmEnabled && createPortal(
        <div className={cn(
          "fixed inset-0 z-[9999]",
          isMobile
            ? "flex items-end justify-center p-0 sm:hidden"
            : "hidden sm:flex items-center justify-center p-4"
        )}>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={handleRecruitCancel}
          />

          {/* Mobile: Bottom Drawer with Rounded Top */}
          {isMobile && (
            <div className="relative bg-white shadow-xl w-full flex flex-col max-h-[90vh] rounded-t-2xl rounded-b-none overflow-hidden"> {/* Add overflow-hidden */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <AddRecruitForm
                  variant="modal"
                  onSuccess={handleRecruitSuccess}
                  onCancel={handleRecruitCancel}
                />
              </div>
            </div>
          )}

          {/* Desktop: Centered Modal */}
          {!isMobile && (
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
              <div className="overflow-y-auto max-h-[90vh] p-6">
                <AddRecruitForm
                  variant="modal"
                  onSuccess={handleRecruitSuccess}
                  onCancel={handleRecruitCancel}
                />
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Event Creation Modal - Mobile: Bottom drawer, Desktop: Centered */}
      {showEventModal && eventsManagementEnabled && typeof window !== 'undefined' && createPortal(
        <div className={cn(
          "fixed inset-0 z-[10000]",
          isMobile
            ? "flex items-end justify-center p-0"
            : "flex items-center justify-center p-4"
        )}>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              setShowEventModal(false);
            }}
          />

          {/* Mobile: Bottom Drawer */}
          {isMobile && (
            <div className="relative bg-white shadow-xl w-full flex flex-col max-h-[80vh] mt-[50vh] rounded-t-2xl rounded-b-none overflow-hidden">
              <EventForm
                event={null}
                onSubmit={handleCreateEvent}
                onCancel={() => {
                  setShowEventModal(false);
                }}
                loading={false}
                isOpen={true}
                isMobile={true}
              />
            </div>
          )}

          {/* Desktop: Centered Modal */}
          {!isMobile && (
            <div className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <EventForm
                event={null}
                onSubmit={handleCreateEvent}
                onCancel={() => {
                  setShowEventModal(false);
                }}
                loading={false}
                isOpen={true}
              />
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
} 