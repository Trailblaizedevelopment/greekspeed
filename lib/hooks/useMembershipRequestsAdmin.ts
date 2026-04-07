'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import type { ChapterMembershipRequest } from '@/types/chapterMembershipRequests';
import type { ProfileForPermission } from '@/lib/permissions';

export interface MembershipRequestChapterGroup {
  chapterId: string;
  chapterName: string;
  requests: ChapterMembershipRequest[];
}

async function fetchPendingForChapter(
  chapterId: string,
  accessToken: string
): Promise<ChapterMembershipRequest[]> {
  const res = await fetch(
    `/api/chapter-membership-requests?chapterId=${encodeURIComponent(chapterId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Failed to load requests');
  }
  const json = (await res.json()) as { data?: ChapterMembershipRequest[] };
  return json.data ?? [];
}

/**
 * TRA-586: governance = parallel GET per managed chapter; others = scoped/home chapter.
 */
export function useMembershipRequestsAdmin() {
  const { session, getAuthHeaders } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const scopedChapterId = useScopedChapterId();

  const [governanceChapters, setGovernanceChapters] = useState<
    { id: string; name: string }[]
  >([]);
  const [governanceMetaReady, setGovernanceMetaReady] = useState(false);

  const [groups, setGroups] = useState<MembershipRequestChapterGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load governance chapter list when role is governance
  useEffect(() => {
    if (profileLoading || !session?.access_token || !profile) {
      return;
    }

    if (profile.role !== 'governance') {
      setGovernanceChapters([]);
      setGovernanceMetaReady(true);
      return;
    }

    let cancelled = false;
    setGovernanceMetaReady(false);

    (async () => {
      try {
        const res = await fetch('/api/me/governance-chapters', {
          headers: getAuthHeaders(),
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!res.ok) {
          setGovernanceChapters([]);
          setGovernanceMetaReady(true);
          return;
        }
        const json = (await res.json()) as {
          chapters?: { id: string; name: string }[];
        };
        setGovernanceChapters(json.chapters ?? []);
      } catch {
        if (!cancelled) {
          setGovernanceChapters([]);
        }
      } finally {
        if (!cancelled) {
          setGovernanceMetaReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    profileLoading,
    profile?.id,
    profile?.role,
    session?.access_token,
    getAuthHeaders,
  ]);

  const loadRequests = useCallback(async () => {
    const token = session?.access_token;
    if (!token || !profile || profileLoading) {
      setGroups([]);
      setLoading(false);
      return;
    }

    const p = profile as ProfileForPermission;

    if (p.role === 'governance' && !governanceMetaReady) {
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (p.role === 'governance') {
        if (governanceChapters.length === 0) {
          setGroups([]);
          setLoading(false);
          return;
        }
        const results = await Promise.all(
          governanceChapters.map(async (c) => {
            const requests = await fetchPendingForChapter(c.id, token);
            return {
              chapterId: c.id,
              chapterName: c.name,
              requests,
            };
          })
        );
        setGroups(results);
      } else {
        const chapterId = scopedChapterId ?? p.chapter_id ?? null;
        if (!chapterId) {
          setGroups([]);
          setLoading(false);
          return;
        }
        const requests = await fetchPendingForChapter(chapterId, token);
        const name =
          profile.chapter && profile.chapter_id === chapterId
            ? profile.chapter
            : 'Chapter';
        setGroups([
          {
            chapterId,
            chapterName: name,
            requests,
          },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [
    session?.access_token,
    profile,
    profileLoading,
    scopedChapterId,
    governanceChapters,
    governanceMetaReady,
  ]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const approve = useCallback(
    async (requestId: string) => {
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch(
        `/api/chapter-membership-requests/${encodeURIComponent(requestId)}/approve`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Approve failed');
      }
      await loadRequests();
    },
    [session?.access_token, getAuthHeaders, loadRequests]
  );

  const reject = useCallback(
    async (requestId: string, rejectionReason?: string) => {
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch(
        `/api/chapter-membership-requests/${encodeURIComponent(requestId)}/reject`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            rejectionReason?.trim()
              ? { rejectionReason: rejectionReason.trim() }
              : {}
          ),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Reject failed');
      }
      await loadRequests();
    },
    [session?.access_token, getAuthHeaders, loadRequests]
  );

  const totalPending = groups.reduce((sum, g) => sum + g.requests.length, 0);

  return {
    groups,
    totalPending,
    loading,
    error,
    refetch: loadRequests,
    approve,
    reject,
    governanceChapterCount: governanceChapters.length,
    governanceMetaReady,
  };
}
