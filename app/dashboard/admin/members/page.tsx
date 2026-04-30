'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { UsersTab } from '@/components/user-management/UsersTab';

export default function AdminMembersPage() {
  const { profile } = useProfile();
  const router = useRouter();
  const chapterId = useScopedChapterId();

  if (!profile) return null;

  const isChapterAdminForContext =
    chapterId &&
    profile.chapter_id === chapterId &&
    profile.role === 'admin';

  if (!isChapterAdminForContext || !chapterId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">
            Chapter admin access is only available for your home chapter in the current space.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Card>
          <CardHeader>
            <div className="flex flex-row items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <UsersTab
              chapterId={chapterId}
              chapterContext={{
                chapterId: chapterId,
                chapterName: profile.chapter || 'Current Chapter',
                isChapterAdmin: true,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
