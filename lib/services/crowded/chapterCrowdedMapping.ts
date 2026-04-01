/**
 * Resolve Crowded API identifiers from a Trailblaize `chapters.id`.
 * Use server-side only with a Supabase client that is allowed to read `chapters` (e.g. service role in scripts/API routes).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CrowdedChapterMapping {
  crowdedChapterId: string;
  crowdedOrganizationId: string | null;
}

type ChapterCrowdedRow = {
  crowded_chapter_id: string | null;
  crowded_organization_id: string | null;
};

/**
 * Returns Crowded IDs stored on the chapter row, or `null` if `crowded_chapter_id` is missing.
 */
export async function getCrowdedIdsForTrailblaizeChapter(
  supabase: SupabaseClient,
  trailblaizeChapterId: string
): Promise<CrowdedChapterMapping | null> {
  const { data, error } = await supabase
    .from('chapters')
    .select('crowded_chapter_id, crowded_organization_id')
    .eq('id', trailblaizeChapterId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as ChapterCrowdedRow | null;
  if (!row?.crowded_chapter_id) {
    return null;
  }

  return {
    crowdedChapterId: row.crowded_chapter_id,
    crowdedOrganizationId: row.crowded_organization_id,
  };
}
