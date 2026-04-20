'use client';

export const dynamic = 'force-dynamic';

import { MobileCalendarPage } from '@/components/features/dashboard/dashboards/ui/MobileCalendarPage';
import { MobileBottomNavigation } from '@/components/features/dashboard/dashboards/ui/MobileBottomNavigation';

/**
 * Standalone chapter calendar + upcoming events (same UI as active member Tools → Calendar).
 * Deep link: /dashboard/calendar — feature-gated inside MobileCalendarPage.
 */
export default function DashboardCalendarPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileCalendarPage />
      <MobileBottomNavigation />
    </div>
  );
}
