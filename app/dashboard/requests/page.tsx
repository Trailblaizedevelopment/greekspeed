'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'react-toastify';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useActiveChapter } from '@/lib/contexts/ActiveChapterContext';
import { useAuth } from '@/lib/supabase/auth-context';
import { canSeeMembershipRequestsNav } from '@/lib/utils/membershipRequestsAccess';
import { useMembershipRequestsAdmin } from '@/lib/hooks/useMembershipRequestsAdmin';
import {
  MembershipRequestsPanel,
  type MembershipRequestDetailSelection,
} from '@/components/features/dashboard/MembershipRequestsPanel';
import { MembershipRequestsPanelSkeleton } from '@/components/features/dashboard/MembershipRequestsPanelSkeleton';
import type { ProfileForPermission } from '@/lib/permissions';
import { membershipRequestIdParamSchema } from '@/lib/validation/chapterMembershipRequests';

/** Page chrome + panel skeleton while profile or search params hydrate. */
function MembershipRequestsPageShellSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="space-y-4">
          <div className="h-9 w-24 rounded-md bg-gray-200 animate-pulse" aria-hidden />
          <div className="h-8 w-64 max-w-full rounded-md bg-gray-200 animate-pulse" aria-hidden />
          <div className="h-4 w-80 max-w-full rounded-md bg-gray-100 animate-pulse" aria-hidden />
        </div>
        <MembershipRequestsPanelSkeleton />
      </div>
    </div>
  );
}

function MembershipRequestsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, getAuthHeaders } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { activeChapterId } = useActiveChapter();

  const [deepLinkDetail, setDeepLinkDetail] =
    useState<MembershipRequestDetailSelection | null>(null);
  const pendingDeepLinkFetchRef = useRef<Set<string>>(new Set());

  const requestParam = searchParams.get('request');

  useEffect(() => {
    if (!requestParam) return;

    const parsed = membershipRequestIdParamSchema.safeParse(requestParam);
    if (!parsed.success) {
      toast.error('This link is invalid.');
      router.replace('/dashboard/requests');
      return;
    }

    const id = parsed.data;
    if (pendingDeepLinkFetchRef.current.has(id)) return;

    if (!session?.access_token) return;

    pendingDeepLinkFetchRef.current.add(id);
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/chapter-membership-requests/${encodeURIComponent(id)}`,
          {
            headers: getAuthHeaders(),
            cache: 'no-store',
          }
        );

        router.replace('/dashboard/requests');

        if (cancelled) return;

        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(
            j.error ?? 'Request not found or you don’t have access.'
          );
          return;
        }

        const json = (await res.json()) as {
          data: MembershipRequestDetailSelection['row'];
          chapterName: string;
        };

        setDeepLinkDetail({
          row: json.data,
          chapterName: json.chapterName,
        });
      } catch {
        router.replace('/dashboard/requests');
        if (!cancelled) {
          toast.error('Could not load that request.');
        }
      } finally {
        pendingDeepLinkFetchRef.current.delete(id);
      }
    })();

    return () => {
      cancelled = true;
      pendingDeepLinkFetchRef.current.delete(id);
    };
  }, [requestParam, session?.access_token, getAuthHeaders, router]);

  const clearDeepLink = useCallback(() => {
    setDeepLinkDetail(null);
  }, []);

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
    return <MembershipRequestsPageShellSkeleton />;
  }

  const permissionProfile = profile as ProfileForPermission;
  const canAccess = canSeeMembershipRequestsNav(permissionProfile, {
    isDeveloper: !!profile.is_developer,
    activeChapterId,
  });

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full shadow-sm">
          <CardContent className="pt-8 pb-6 text-center">
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Access denied</h1>
            <p className="text-sm text-gray-600 mb-6">
              You do not have permission to review chapter membership requests.
            </p>
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ variant: 'default' }))}
            >
              Back to dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (
    profile.role === 'governance' &&
    governanceMetaReady &&
    governanceChapterCount === 0
  ) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <Link
                href="/dashboard/governance"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'inline-flex items-center'
                )}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 mt-4">
                Membership requests
              </h1>
            </div>
          </div>
          <Card className="border-gray-200 shadow-sm">
            <CardContent className="py-12 text-center text-gray-600">
              <p className="font-medium text-gray-800">No managed chapters</p>
              <p className="text-sm mt-2 max-w-md mx-auto">
                You are not assigned to any chapters for governance. When chapters are
                linked to your account, pending join requests will appear here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const showMultiSummary =
    profile.role === 'governance' && governanceChapterCount > 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
          <div>
            <Link
              href={
                profile.role === 'governance'
                  ? '/dashboard/governance'
                  : '/dashboard'
              }
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'inline-flex items-center'
              )}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">
              Membership requests
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Approve or reject pending chapter access requests.
            </p>
          </div>
          {!showMultiSummary && totalPending > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm">
              <span className="font-semibold text-gray-900">{totalPending}</span>{' '}
              pending
            </div>
          )}
        </div>

        <MembershipRequestsPanel
          groups={groups}
          totalPending={totalPending}
          loading={loading}
          error={error}
          showMultiChapterSummary={showMultiSummary}
          showNoChapterCard={profile.role !== 'governance'}
          deepLinkDetail={deepLinkDetail}
          onDeepLinkConsumed={clearDeepLink}
          approve={approve}
          reject={reject}
        />
      </div>
    </div>
  );
}

export default function DashboardMembershipRequestsPage() {
  return (
    <Suspense fallback={<MembershipRequestsPageShellSkeleton />}>
      <MembershipRequestsPageInner />
    </Suspense>
  );
}
