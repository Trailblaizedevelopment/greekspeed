import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChapterHealthRow } from '@/types/governance';

/**
 * Engagement percentage at or above this value → "active"; strictly below → "at_risk".
 * Override via CHAPTER_HEALTH_ENGAGEMENT_THRESHOLD env var.
 */
export const ENGAGEMENT_THRESHOLD =
  Number(process.env.CHAPTER_HEALTH_ENGAGEMENT_THRESHOLD) || 60;

const ENGAGEMENT_WINDOW_DAYS = 30;

/**
 * Returns the list of chapter IDs a governance user can manage.
 * Includes rows from governance_chapters plus the user's home chapter_id if not already in the table.
 * Returns [] for non-governance users.
 */
export async function getManagedChapterIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, chapter_id')
    .eq('id', userId)
    .single();

  if (profileError || !profile) return [];
  if (profile.role !== 'governance') return [];

  const { data: rows, error } = await supabase
    .from('governance_chapters')
    .select('chapter_id')
    .eq('user_id', userId);

  if (error) return [];

  const ids = (rows ?? []).map((r) => r.chapter_id);
  const homeId = profile.chapter_id ?? null;
  if (homeId && !ids.includes(homeId)) {
    ids.push(homeId);
  }
  return ids;
}

/**
 * Builds per-chapter health rows for a set of managed chapter IDs.
 * Each row includes member counts, engagement %, last activity, and computed status.
 */
export async function getChapterHealthRows(
  supabase: SupabaseClient,
  chapterIds: string[]
): Promise<ChapterHealthRow[]> {
  if (chapterIds.length === 0) return [];

  const { data: chapters, error: chaptersError } = await supabase
    .from('chapters')
    .select('id, name, school')
    .in('id', chapterIds);

  if (chaptersError || !chapters) return [];

  const { data: members, error: membersError } = await supabase
    .from('profiles')
    .select('chapter_id, member_status, last_active_at')
    .in('chapter_id', chapterIds);

  if (membersError) return [];

  const rows = members ?? [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ENGAGEMENT_WINDOW_DAYS);
  const cutoffISO = cutoff.toISOString();

  return chapters.map((chapter) => {
    const chapterMembers = rows.filter((m) => m.chapter_id === chapter.id);

    const activeMembers = chapterMembers.filter(
      (m) => m.member_status === 'active'
    ).length;

    const alumniCount = chapterMembers.filter(
      (m) => m.member_status === 'alumni' || m.member_status === 'graduated'
    ).length;

    const eligibleMembers = chapterMembers.filter(
      (m) => m.member_status !== 'graduated'
    );

    const engagedCount = eligibleMembers.filter(
      (m) => m.last_active_at && m.last_active_at >= cutoffISO
    ).length;

    const engagementPercent =
      eligibleMembers.length > 0
        ? Math.round((engagedCount / eligibleMembers.length) * 1000) / 10
        : 0;

    const lastActivityAt =
      chapterMembers.reduce<string | null>((latest, m) => {
        if (!m.last_active_at) return latest;
        if (!latest) return m.last_active_at;
        return m.last_active_at > latest ? m.last_active_at : latest;
      }, null);

    const status: ChapterHealthRow['status'] =
      engagementPercent < ENGAGEMENT_THRESHOLD ? 'at_risk' : 'active';

    return {
      chapterId: chapter.id,
      chapterName: chapter.name ?? '',
      school: chapter.school ?? '',
      activeMembers,
      alumniCount,
      engagementPercent,
      lastActivityAt,
      status,
    };
  });
}
