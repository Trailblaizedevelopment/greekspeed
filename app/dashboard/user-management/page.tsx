'use client';

import { useEffect, useState } from 'react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { DeveloperPortal } from '@/components/features/dashboard/dashboards/DeveloperPortal';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Shield, GraduationCap } from 'lucide-react';
import { UsersTab } from '@/components/user-management/UsersTab';
import { ChaptersTab } from '@/components/user-management/ChaptersTab';
import { AlumniTab } from '@/components/user-management/AlumniTab';
import { ViewChapterModal } from '@/components/user-management/ViewChapterModal';

export default function UserManagementPage() {
  const { profile, isDeveloper } = useProfile();
  const [activeTab, setActiveTab] = useState('users');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'chapters' || t === 'users' || t === 'alumni') {
      setActiveTab(t);
    }
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
        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="users" className="flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Users</span>
              </TabsTrigger>
              <TabsTrigger value="chapters" className="flex items-center space-x-2">
                <Shield className="h-4 w-4" />
                <span>Chapters</span>
              </TabsTrigger>
              <TabsTrigger value="alumni" className="flex items-center space-x-2">
                <GraduationCap className="h-4 w-4" />
                <span>Alumni</span>
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
          </Tabs>
        </div>
      </div>
    </DeveloperPortal>
  );
}
