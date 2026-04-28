'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { DeveloperPortal } from '@/components/features/dashboard/dashboards/DeveloperPortal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Shield, GraduationCap, School, Landmark } from 'lucide-react';
import { UsersTab } from '@/components/user-management/UsersTab';
import { ChaptersTab } from '@/components/user-management/ChaptersTab';
import { AlumniTab } from '@/components/user-management/AlumniTab';
import { SchoolsDirectoryTab } from '@/components/user-management/SchoolsDirectoryTab';
import { NationalOrganizationsDirectoryTab } from '@/components/user-management/NationalOrganizationsDirectoryTab';

const TAB_VALUES = ['users', 'chapters', 'alumni', 'schools', 'national_orgs'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(v: string | null): v is TabValue {
  return v != null && (TAB_VALUES as readonly string[]).includes(v);
}

export default function UserManagementPage() {
  const { isDeveloper } = useProfile();
  const [activeTab, setActiveTab] = useState<TabValue>('users');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('tab');
    if (isTabValue(t)) setActiveTab(t);
  }, []);

  const handleTabChange = useCallback((v: string) => {
    if (!isTabValue(v)) return;
    setActiveTab(v);
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    u.searchParams.set('tab', v);
    window.history.replaceState(null, '', u.toString());
  }, []);

  if (!isDeveloper) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">You don't have access to user management.</p>
        </div>
      </div>
    );
  }

  return (
    <DeveloperPortal>
      <div className="min-h-full bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <TabsList className="grid w-full h-auto grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1 p-1">
              <TabsTrigger value="users" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2">
                <Users className="h-4 w-4 shrink-0" />
                <span>Users</span>
              </TabsTrigger>
              <TabsTrigger value="chapters" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2">
                <Shield className="h-4 w-4 shrink-0" />
                <span>Spaces</span>
              </TabsTrigger>
              <TabsTrigger value="alumni" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2">
                <GraduationCap className="h-4 w-4 shrink-0" />
                <span>Alumni</span>
              </TabsTrigger>
              <TabsTrigger value="schools" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2">
                <School className="h-4 w-4 shrink-0" />
                <span>Schools</span>
              </TabsTrigger>
              <TabsTrigger value="national_orgs" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2 py-2">
                <Landmark className="h-4 w-4 shrink-0" />
                <span className="truncate">National orgs</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-6">
              <UsersTab />
            </TabsContent>

            <TabsContent value="chapters" className="space-y-6">
              <ChaptersTab />
            </TabsContent>

            <TabsContent value="alumni" className="space-y-6">
              <AlumniTab />
            </TabsContent>

            <TabsContent value="schools" className="space-y-6">
              <SchoolsDirectoryTab />
            </TabsContent>

            <TabsContent value="national_orgs" className="space-y-6">
              <NationalOrganizationsDirectoryTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DeveloperPortal>
  );
}
