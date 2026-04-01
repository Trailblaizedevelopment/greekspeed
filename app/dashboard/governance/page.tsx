'use client';

import { useRoleAccess } from '@/lib/hooks/useRoleAccess';
import { GovernanceOverview } from '@/components/features/dashboard/dashboards/GovernanceOverview';

export default function GovernancePage() {
  const { hasAccess, loading } = useRoleAccess(['governance']);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-brand-primary mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">
            This page is only available to governance users.
          </p>
        </div>
      </div>
    );
  }

  return <GovernanceOverview />;
}
