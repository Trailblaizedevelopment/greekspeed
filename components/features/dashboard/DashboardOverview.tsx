'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlumniOverview } from './dashboards/AlumniOverview';
import { ActiveMemberOverview } from './dashboards/ActiveMemberOverview';
import { AdminOverview } from './dashboards/AdminOverview';
import { DeveloperOverview } from './dashboards/DeveloperOverview';
import type { SocialFeedInitialData } from './dashboards/ui/SocialFeed';
import { useActiveChapter } from '@/lib/contexts/ActiveChapterContext';
import { useProfile } from '@/lib/contexts/ProfileContext';


interface DashboardOverviewProps {
  userRole: string | null;
  isDeveloper?: boolean;
  initialFeed?: SocialFeedInitialData;
  fallbackChapterId?: string | null;
}

export function DashboardOverview({
  userRole,
  initialFeed,
  fallbackChapterId,
}: DashboardOverviewProps) {
  const { isDeveloper } = useProfile();
  const { activeChapterId } = useActiveChapter();
  const router = useRouter();

  // Governance users land on the dedicated governance dashboard
  useEffect(() => {
    if (!isDeveloper && userRole === 'governance') {
      router.replace('/dashboard/governance');
    }
  }, [userRole, isDeveloper, router]);

  // Check if user is a developer first
  if (isDeveloper) {
    // If a developer has selected a chapter, render that chapter's dashboard view
    // (this is the start of "workspace-style" traversal).
    if (activeChapterId) {
      return <AdminOverview initialFeed={initialFeed} fallbackChapterId={activeChapterId} />;
    }

    // Otherwise, show the developer portal overview
    return <DeveloperOverview />;
  }

  // Render role-specific dashboard based on userRole
  if (userRole === 'alumni') {
    return <AlumniOverview initialFeed={initialFeed} fallbackChapterId={fallbackChapterId} />;
  }
  
  if (userRole === 'active_member') {
    return <ActiveMemberOverview initialFeed={initialFeed} fallbackChapterId={fallbackChapterId} />;
  }
  
  if (userRole === 'admin') {
    return <AdminOverview initialFeed={initialFeed} fallbackChapterId={fallbackChapterId} />;
  }

  // Governance redirect is handled by the effect above; show loading while it navigates
  if (userRole === 'governance') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-brand-primary mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }
  
  // Default dashboard for fallback - Show loading instead of placeholder
  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-brand-primary mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // This should never be reached if we wait for role above, but kept as safety
  return null;
}