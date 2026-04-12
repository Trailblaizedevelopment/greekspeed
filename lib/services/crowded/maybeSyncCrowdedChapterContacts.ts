import type { SupabaseClient } from '@supabase/supabase-js';
import { createCrowdedClientFromEnv } from '@/lib/services/crowded/crowded-client';
import { syncChapterContactsToCrowded } from '@/lib/services/crowded/syncChapterContactsToCrowded';
import { isFeatureEnabled } from '@/types/featureFlags';

/**
 * When `crowded_contact_sync_enabled` is on for the chapter, syncs missing Crowded contacts
 * for the given profile ids (or best-effort). Swallows Crowded env errors — callers keep primary success.
 */
export async function maybeSyncCrowdedChapterContacts(params: {
  supabase: SupabaseClient;
  trailblaizeChapterId: string;
  memberIds?: string[] | null;
}): Promise<void> {
  const chapterId = params.trailblaizeChapterId.trim();
  if (!chapterId) return;

  const { data: chapter, error } = await params.supabase
    .from('chapters')
    .select('feature_flags, crowded_chapter_id')
    .eq('id', chapterId)
    .maybeSingle();

  if (error || !chapter) return;
  if (!isFeatureEnabled(chapter.feature_flags, 'crowded_contact_sync_enabled')) return;
  if (!isFeatureEnabled(chapter.feature_flags, 'crowded_integration_enabled')) return;

  const crowdedChapterId = (chapter.crowded_chapter_id as string | null)?.trim();
  if (!crowdedChapterId) return;

  let crowded;
  try {
    crowded = createCrowdedClientFromEnv();
  } catch {
    return;
  }

  try {
    await syncChapterContactsToCrowded({
      supabase: params.supabase,
      crowded,
      trailblaizeChapterId: chapterId,
      crowdedChapterId,
      memberIds: params.memberIds ?? undefined,
    });
  } catch (e) {
    console.error('maybeSyncCrowdedChapterContacts:', e);
  }
}
