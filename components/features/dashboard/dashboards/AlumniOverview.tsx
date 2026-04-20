'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Home, Users, User, Search, Building2 } from 'lucide-react';
import { PersonalAlumniProfile } from './ui/PersonalAlumniProfile';
import { SocialFeed, type SocialFeedInitialData } from './ui/SocialFeed';
import { NetworkingSpotlightCard } from './ui/NetworkingSpotlightCard';
import { CalendarEventsWeekCard } from './ui/CalendarEventsWeekCard';
import { SocialFeedEventsRail } from './ui/SocialFeedEventsRail';
import type { Event } from '@/types/events';
import { MobileNetworkPage } from './ui/MobileNetworkPage';
import { MobileProfilePage } from './ui/MobileProfilePage';
import { AlumniPipeline } from '@/components/features/alumni/AlumniPipeline';
import { MyChapterPage } from '@/components/mychapter/MyChapterPage';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useRouter } from 'next/navigation';
import { MobileBottomNavigation } from './ui/MobileBottomNavigation';
import { cn } from '@/lib/utils';

interface Profile {
  id: string;
  name: string;
  avatar: string;
  chapter: string;
  gradYear: number;
  jobTitle: string;
  company: string;
  isActivelyHiring: boolean;
  location: string;
  mutualConnections: number;
}

interface AlumniOverviewProps {
  initialFeed?: SocialFeedInitialData;
  fallbackChapterId?: string | null;
}

export function AlumniOverview({ initialFeed, fallbackChapterId }: AlumniOverviewProps) {
  const { profile, isDeveloper } = useProfile();
  // Developers can "view as" another chapter via ActiveChapterContext, which is passed in as fallbackChapterId.
  // In that case we intentionally prefer the fallbackChapterId over the profile's chapter_id.
  const chapterId = (isDeveloper ? (fallbackChapterId ?? profile?.chapter_id) : (profile?.chapter_id ?? fallbackChapterId)) ?? null;
  const router = useRouter();
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const selectedProfileState = useState<Profile | null>(null);
  const selectedProfile = selectedProfileState[0];
  const [activeMobileTab, setActiveMobileTab] = useState('home');

  // Desktop: shared events for CalendarEventsWeekCard (same pattern as ActiveMemberOverview)
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const fetchAllEvents = useCallback(async () => {
    if (!chapterId || !profile?.id) {
      setAllEvents([]);
      setEventsError(null);
      setEventsLoading(false);
      return;
    }
    try {
      setEventsLoading(true);
      setEventsError(null);
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

  const alumniMobileFeedEventSlot = useMemo(
    () => (
      <SocialFeedEventsRail
        events={allEvents}
        loading={eventsLoading}
        error={eventsError}
        onRetry={fetchAllEvents}
      />
    ),
    [allEvents, eventsLoading, eventsError, fetchAllEvents]
  );

  const renderMobileContent = () => {
    switch (activeMobileTab) {
      case 'home':
        return (
          <div className="space-y-4">
            {/* Social Feed - Primary feature for alumni */}
            <div className="w-full">
              <SocialFeed
                chapterId={chapterId || ''}
                initialData={initialFeed}
                inlineFeedSlot={alumniMobileFeedEventSlot}
                inlineSlotAfterPostIndex={3}
              />
            </div>
          </div>
        );
      case 'network':
        return <MobileNetworkPage />;
      case 'profile':
        return <MobileProfilePage />;
      default:
        return (
          <div className="space-y-4">
            <div className="w-full">
              <SocialFeed
                chapterId={chapterId || ''}
                initialData={initialFeed}
                inlineFeedSlot={alumniMobileFeedEventSlot}
                inlineSlotAfterPostIndex={3}
              />
            </div>
          </div>
        );
    }
  };

  // Define alumni navigation tabs
  const alumniTabs = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      onClick: () => setActiveMobileTab('home'),
    },
    {
      id: 'network',
      label: 'Network',
      icon: Users,
      onClick: () => setActiveMobileTab('network'),
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      icon: Search,
      onClick: () => setActiveMobileTab('pipeline'),
    },
    {
      id: 'chapter',
      label: 'Members',
      icon: Building2,
      onClick: () => setActiveMobileTab('chapter'),
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: User,
      onClick: () => {
        setActiveMobileTab('profile');
        router.push('/dashboard/profile');
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Layout - Hidden on mobile */}
      <div className="hidden sm:block">
        {/* Main Content - Three Column Layout */}
        <div className="max-w-full mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          
          {/* Center Column - Social Feed (RENDER FIRST for faster paint) */}
          <div className="col-span-6 col-start-4">
            <SocialFeed chapterId={chapterId || ''} initialData={initialFeed} />
          </div>

          {/* Left Sidebar - Networking Spotlight */}
          <div className="col-span-3 col-start-1 row-start-1">
            <NetworkingSpotlightCard />
          </div>

          {/* Right Sidebar - Profile + upcoming events (desktop only for now) */}
          <div className="col-span-3 col-start-10 row-start-1">
            <div className="space-y-6">
              <PersonalAlumniProfile />
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
      </div>

      {/* Mobile Layout - Visible only on mobile */}
      <div className="sm:hidden">
        {activeMobileTab === 'pipeline' ? (
          <>
            <AlumniPipeline />
            <MobileBottomNavigation 
              tabs={alumniTabs}
              activeTab={activeMobileTab}
              onTabChange={setActiveMobileTab}
              showToolsMenu={false}
            />
          </>
        ) : activeMobileTab === 'chapter' ? (
          <>
            <MyChapterPage />
            <MobileBottomNavigation 
              tabs={alumniTabs}
              activeTab={activeMobileTab}
              onTabChange={setActiveMobileTab}
              showToolsMenu={false}
            />
          </>
        ) : (
          <>
            <div className={cn(
              "min-h-screen bg-gray-50 pb-20",
              activeMobileTab === 'network' ? 'px-0' : 'px-4'
            )}>
              <div
                className={
                  activeMobileTab === 'network' || activeMobileTab === 'home'
                    ? ''
                    : 'max-w-md mx-auto'
                }
              >
                {renderMobileContent()}
              </div>
            </div>
            <MobileBottomNavigation 
              tabs={alumniTabs}
              activeTab={activeMobileTab}
              onTabChange={setActiveMobileTab}
              showToolsMenu={false}
            />
          </>
        )}
      </div>

      {/* Modals */}
      {connectModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Connect with {selectedProfile?.name}</h3>
            <p className="text-gray-600 mb-4">Connection functionality coming soon!</p>
            <div className="flex space-x-2">
              <Button onClick={() => setConnectModalOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
} 