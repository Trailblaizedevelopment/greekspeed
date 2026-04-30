import type { SupabaseClient } from '@supabase/supabase-js';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import type { EventAudienceViewer } from '@/lib/utils/eventAudienceVisibility';

type ProfileRow = {
  chapter_id: string | null;
  role: string | null;
  chapter_role: string | null;
  is_developer: boolean | null;
};

/**
 * Builds an EventAudienceViewer for a specific chapter's events, including
 * per-space alumni vs active (space_memberships) for multi-space users.
 */
export async function buildEventAudienceViewerForChapter(
  supabase: SupabaseClient,
  userId: string,
  chapterId: string,
  profile: ProfileRow
): Promise<EventAudienceViewer> {
  const profile_chapter_id = profile.chapter_id ?? null;
  let governance_managed_chapter_ids: string[] | null = null;
  if (profile.role === 'governance') {
    governance_managed_chapter_ids = await getManagedChapterIds(supabase, userId);
  }

  const { data: membership } = await supabase
    .from('space_memberships')
    .select('status')
    .eq('user_id', userId)
    .eq('space_id', chapterId)
    .neq('status', 'inactive')
    .maybeSingle();

  let audience_segment: 'alumni' | 'active_member' | null = null;
  if (membership) {
    audience_segment = membership.status === 'alumni' ? 'alumni' : 'active_member';
  } else if (profile_chapter_id === chapterId) {
    if (profile.role === 'alumni') audience_segment = 'alumni';
    else if (
      profile.role === 'active_member' ||
      profile.role === 'admin' ||
      profile.role === 'governance'
    ) {
      audience_segment = 'active_member';
    }
  }

  return {
    role: profile.role,
    chapter_role: profile.chapter_role,
    profile_chapter_id,
    is_developer: profile.is_developer ?? false,
    governance_managed_chapter_ids,
    audience_segment,
  };
}
