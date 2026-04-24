'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { SocialFeed, type SocialFeedInitialData } from './ui/SocialFeed';
import { DuesStatusCard } from './ui/DuesStatusCard';
import { Event } from '@/types/events';
import { MyTasksCard } from './ui/MyTasksCard';
import { AnnouncementsCard } from './ui/AnnouncementsCard';
import { AnnouncementsProvider } from '@/lib/contexts/AnnouncementsContext';
import { DocsCompliancePanel } from './ui/DocsCompliancePanel';
import { CalendarEventsWeekCard } from './ui/CalendarEventsWeekCard';
import { MobileBottomNavigation, MobileTab } from './ui/MobileBottomNavigation';
import { MobileTasksPage } from './ui/MobileTasksPage';
import { MobileAnnouncementsPage } from './ui/MobileAnnouncementsPage';
import { MobileCalendarPage } from './ui/MobileCalendarPage';
import { MobileEventsPage } from './ui/MobileEventsPage';
import { MobileDocsCompliancePage } from './ui/MobileDocsCompliancePage';
import { MobileOperationsFeedPage } from './ui/MobileOperationsFeedPage';
import { AddRecruitForm } from '@/components/features/recruitment/AddRecruitForm';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { FeatureGuard } from '@/components/shared/FeatureGuard';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { toast } from 'react-toastify';
import type { Recruit } from '@/types/recruitment';
import { cn } from '@/lib/utils';

interface ActiveMemberOverviewProps {
  initialFeed?: SocialFeedInitialData;
  fallbackChapterId?: string | null;
}

// Inner component that uses useSearchParams
function ActiveMemberOverviewContent({ initialFeed, fallbackChapterId }: ActiveMemberOverviewProps) {
  const { profile } = useProfile();
  const scopedChapterId = useScopedChapterId();
  const chapterId = scopedChapterId ?? fallbackChapterId ?? profile?.chapter_id ?? null;
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('home');
  const searchParams = useSearchParams();
  const router = useRouter();
  const { enabled: financialToolsEnabled } = useFeatureFlag('financial_tools_enabled');
  const { enabled: recruitmentCrmEnabled } = useFeatureFlag('recruitment_crm_enabled');
  const [showAddRecruitModal, setShowAddRecruitModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Shared events fetch (eliminates duplicate API call) ----
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const fetchAllEvents = useCallback(async () => {
    if (!chapterId || !profile?.id) return;
    try {
      setEventsLoading(true);
      setEventsError(null);
      // Single call with scope=all AND user_id — tablet UpcomingEventsCard + desktop CalendarEventsWeekCard
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

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle tool query param from Tools menu - Updated for new options
  useEffect(() => {
    const tool = searchParams.get('tool');
    if (tool === 'dues') {
      // Only redirect if financial tools are enabled
      if (financialToolsEnabled) {
        router.push('/dashboard/dues');
      } else {
        // If disabled, just clear the tool param
        router.push('/dashboard');
      }
    } else if (tool === 'announcements') {
      setActiveMobileTab('announcements');
    } else if (tool === 'calendar') {
      setActiveMobileTab('calendar');
    } else if (tool === 'recruitment') {
      // Add this block
      if (recruitmentCrmEnabled) {
        setShowAddRecruitModal(true);
        // Clear the query param after opening modal
        router.replace('/dashboard', { scroll: false });
      } else {
        router.push('/dashboard');
      }
    } else if (!tool) {
      setActiveMobileTab('home');
    }
  }, [searchParams, router, financialToolsEnabled, recruitmentCrmEnabled]);

  const renderMobileContent = () => {
    // Handle regular tabs
    switch (activeMobileTab) {
      case 'home':
        return (
          <div className="space-y-4">
            {/* Primary Feature: Social Feed */}
            <div className="w-full">
              <SocialFeed chapterId={chapterId || ''} initialData={initialFeed} />
            </div>
          </div>
        );
      case 'tasks':
        return <MobileTasksPage />;
      case 'announcements':
        return <MobileAnnouncementsPage />;
      case 'calendar':
        return <MobileCalendarPage />;
      case 'events':
        return <MobileEventsPage />;
      default:
        return (
          <div className="space-y-4">
            {/* Primary Feature: Social Feed */}
            <div className="w-full">
              <SocialFeed chapterId={chapterId || ''} initialData={initialFeed} />
            </div>
          </div>
        );
    }
  };
  
  // Add this handler function to fix the type mismatch
  const handleTabChange = (tab: MobileTab | string) => {
    // Type guard to ensure we're setting a valid MobileTab
    const validTabs: MobileTab[] = ['home', 'tasks', 'announcements', 'calendar', 'events'];
    if (validTabs.includes(tab as MobileTab)) {
      setActiveMobileTab(tab as MobileTab);
    }
  };

  // Add Recruit handlers
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

  return (
    <AnnouncementsProvider chapterId={chapterId}>
    <div className="min-h-screen bg-gray-50">
      {/* Main Content - Mobile-First Layout */}
      <div className="max-w-full mx-auto px-4 sm:px-6 pt-2 pb-24 sm:py-6 sm:pb-6">
        {/* Mobile Layout: Tab-based Navigation - pt-2 on mobile brings tabs closer to header */}
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
              <CalendarEventsWeekCard
                userId={profile?.id}
                events={allEvents}
                loading={eventsLoading}
                error={eventsError}
                onRetry={fetchAllEvents}
              />
              <FeatureGuard flagName="financial_tools_enabled">
                <DuesStatusCard />
              </FeatureGuard>
              {/* Important: Announcements visible on tablet since left sidebar is hidden */}
              <AnnouncementsCard />
            </div>
          </div>
        </div>

        {/* Desktop Layout: Three Column Grid (Preserved) */}
        <div className="hidden lg:grid lg:grid-cols-12 lg:gap-6">
          {/* Center Column - Social Feed (RENDER FIRST for faster paint) */}
          <div className="col-span-6 col-start-4">
            <SocialFeed chapterId={chapterId || ''} initialData={initialFeed} />
          </div>

          {/* Left Sidebar - Dues, Tasks, Calendar & Documents */}
          <div className="col-span-3 col-start-1 row-start-1">
            <div className="space-y-6">
              <FeatureGuard flagName="financial_tools_enabled">
                <DuesStatusCard />
              </FeatureGuard>
              <AnnouncementsCard />
              <MyTasksCard />
            </div>
          </div>

          {/* Right Sidebar - Events & Networking */}
          <div className="col-span-3 col-start-10 row-start-1">
            <div className="space-y-6">
              <CalendarEventsWeekCard
                userId={profile?.id}
                events={allEvents}
                loading={eventsLoading}
                error={eventsError}
                onRetry={fetchAllEvents}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation - Now auto-configures based on role */}
      <MobileBottomNavigation 
        activeTab={activeMobileTab} 
        onTabChange={handleTabChange}
      />

      {/* Quick Actions Floating Action Button - Lightning Bolt (Stacked above Posts Plus Button) - Only on Home Page (Mobile Only) */}
      {activeMobileTab === 'home' && recruitmentCrmEnabled && (
        <div
          onClick={handleAddRecruit}
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
          title="Add Recruit"
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
            <div className="relative bg-white shadow-xl w-full flex flex-col max-h-[90vh] rounded-t-2xl rounded-b-none overflow-hidden">
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
    </div>
    </AnnouncementsProvider>
  );
}

// Main component with Suspense wrapper
export function ActiveMemberOverview({ initialFeed, fallbackChapterId }: ActiveMemberOverviewProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <ActiveMemberOverviewContent initialFeed={initialFeed} fallbackChapterId={fallbackChapterId} />
    </Suspense>
  );
}