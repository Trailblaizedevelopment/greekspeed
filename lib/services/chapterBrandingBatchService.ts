import type { SupabaseClient } from '@supabase/supabase-js';

/** Batched primary logos for chapter/space pickers (chapter_branding.chapter_id = spaces.id). */
export async function fetchPrimaryLogoUrlByChapterIds(
  supabase: SupabaseClient,
  chapterIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const uniq = [...new Set(chapterIds.filter(Boolean))];
  if (uniq.length === 0) return map;

  const { data, error } = await supabase
    .from('chapter_branding')
    .select('chapter_id, primary_logo_url')
    .in('chapter_id', uniq);

  if (error) {
    console.error('fetchPrimaryLogoUrlByChapterIds:', error.message);
    return map;
  }

  for (const row of data ?? []) {
    const cid = row.chapter_id as string | undefined;
    if (cid) {
      map.set(cid, (row.primary_logo_url as string | null | undefined) ?? null);
    }
  }
  return map;
}
