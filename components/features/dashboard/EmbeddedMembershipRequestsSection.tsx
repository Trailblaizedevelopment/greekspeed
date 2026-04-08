'use client';

import { Card, CardContent } from '@/components/ui/card';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useActiveChapter } from '@/lib/contexts/ActiveChapterContext';
import { canSeeMembershipRequestsNav } from '@/lib/utils/membershipRequestsAccess';
import type { ProfileForPermission } from '@/lib/permissions';
import { useMembershipRequestsAdmin } from '@/lib/hooks/useMembershipRequestsAdmin';
import { MembershipRequestsPanel } from '@/components/features/dashboard/MembershipRequestsPanel';

/**
 * TRA-589: Inline membership request review (no dashboard header tab). Used on exec
 * admin overview and governance overview.
 */
export function EmbeddedMembershipRequestsSection() {
  const { profile, loading: profileLoading } = useProfile();
  const { activeChapterId } = useActiveChapter();
  const {
    groups,
    totalPending,
    loading,
    error,
    approve,
    reject,
    governanceChapterCount,
    governanceMetaReady,
  } = useMembershipRequestsAdmin();

  if (profileLoading || !profile) {
    return null;
  }

  const permissionProfile = {
    role: profile.role,
    chapter_id: profile.chapter_id,
    chapter_role: profile.chapter_role,
  } as ProfileForPermission;

  const eligible = canSeeMembershipRequestsNav(permissionProfile, {
    isDeveloper: !!profile.is_developer,
    activeChapterId,
  });

  if (!eligible) {
    return null;
  }

  if (profile.role === 'governance' && governanceMetaReady && governanceChapterCount === 0) {
    return (
      <section aria-label="Membership requests">
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="py-12 text-center text-gray-600">
            <p className="font-medium text-gray-800">No managed chapters</p>
            <p className="text-sm mt-2 max-w-md mx-auto">
              You are not assigned to any chapters for governance. When chapters are linked
              to your account, pending join requests will appear here.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const showMultiChapterSummary =
    profile.role === 'governance' && governanceChapterCount > 1;

  return (
    <section aria-label="Membership requests">
      <MembershipRequestsPanel
        groups={groups}
        totalPending={totalPending}
        loading={loading}
        error={error}
        showMultiChapterSummary={showMultiChapterSummary}
        showNoChapterCard={profile.role !== 'governance'}
        approve={approve}
        reject={reject}
      />
    </section>
  );
}
