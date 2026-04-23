import type { SupabaseClient } from '@supabase/supabase-js';
import { canManageMembers, type ProfileForPermission } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';

/**
 * Chapter IDs whose pending membership queue the user may see in-app (TRA-592).
 * Aligns with exec/governance scoped fetch in `useMembershipRequestsAdmin` + TRA-590 recipient rules.
 */
export async function getManageableChapterIdsForMembershipFeed(
  supabase: SupabaseClient,
  userId: string,
  profile: ProfileForPermission
): Promise<string[]> {
  if (!profile.role) return [];
  if (profile.role === 'governance') {
    return getManagedChapterIds(supabase, userId);
  }
  if (profile.role === 'admin' && profile.chapter_id) {
    return [profile.chapter_id];
  }
  if (profile.chapter_id && canManageMembers(profile.role, profile.chapter_role)) {
    return [profile.chapter_id];
  }
  return [];
}

type ProfileEmbed = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export interface MembershipRequestFeedRow {
  id: string;
  created_at: string;
  chapter_id: string;
  applicant_full_name: string | null;
  user_id: string;
  /** Supabase may return a single object or a one-element array */
  applicant: ProfileEmbed | ProfileEmbed[] | null;
  chapter: { id: string; name: string } | { id: string; name: string }[] | null;
}

/**
 * Pending requests for notifications feed (newest first).
 */
export async function listPendingMembershipRequestsForFeed(
  supabase: SupabaseClient,
  chapterIds: string[],
  limit: number
): Promise<MembershipRequestFeedRow[]> {
  if (chapterIds.length === 0) return [];

  const { data, error } = await supabase
    .from('chapter_membership_requests')
    .select(
      `
      id,
      created_at,
      chapter_id,
      applicant_full_name,
      user_id,
      applicant:profiles!user_id(id, full_name, first_name, last_name, avatar_url),
      chapter:spaces!chapter_id(id, name)
    `
    )
    .eq('status', 'pending')
    .in('chapter_id', chapterIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listPendingMembershipRequestsForFeed:', error);
    return [];
  }

  return (data ?? []) as MembershipRequestFeedRow[];
}
