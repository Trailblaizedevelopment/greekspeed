import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSimulationSpaceRow } from '@/lib/dataSeeds/spaceSeedMapping';

async function loadSpaceUniquenessSets(supabase: SupabaseClient): Promise<{
  usedSlugs: Set<string>;
  usedNames: Set<string>;
  usedComposites: Set<string>;
}> {
  const usedSlugs = new Set<string>();
  const usedNames = new Set<string>();
  const usedComposites = new Set<string>();
  const compositeKey = (nf: string, cn: string, sch: string) =>
    `${nf.toLowerCase()}::${cn.toLowerCase()}::${sch.toLowerCase()}`;

  const pageSize = 2000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('spaces')
      .select('slug,name,national_fraternity,chapter_name,school')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('loadSpaceUniquenessSets:', error.message);
      break;
    }
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const r of rows) {
      if (r.slug) usedSlugs.add(r.slug);
      if (r.name) usedNames.add(r.name.toLowerCase());
      if (r.national_fraternity && r.chapter_name && r.school) {
        usedComposites.add(compositeKey(r.national_fraternity, r.chapter_name, r.school));
      }
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return { usedSlugs, usedNames, usedComposites };
}

/**
 * Find an existing simulation-style space by exact name or slug, or create one (TRA-665).
 * Uses the same naming rules as `scripts/import-data-seeds.ts`.
 */
export async function findOrCreateSpaceFromSimulationLabel(
  supabase: SupabaseClient,
  params: {
    rawName: string;
    category?: string;
    profileWeight?: string;
    source?: string;
  }
): Promise<{ ok: true; id: string; created: boolean } | { ok: false; error: string }> {
  const raw = params.rawName.trim();
  if (!raw) return { ok: false, error: 'name is required' };

  const cat = (params.category ?? 'Uncategorized').trim();

  const { data: exactName } = await supabase.from('spaces').select('id').eq('name', raw).maybeSingle();
  if (exactName?.id) {
    return { ok: true, id: exactName.id, created: false };
  }

  const { usedSlugs, usedNames, usedComposites } = await loadSpaceUniquenessSets(supabase);

  const row = buildSimulationSpaceRow({
    rawName: raw,
    category: cat,
    profileWeight: params.profileWeight ?? '0',
    source: params.source ?? 'api_ensure_reference',
    usedSlugs,
    usedNames,
    usedComposites,
  });

  const insertPayload = {
    name: row.name,
    slug: row.slug,
    national_fraternity: row.national_fraternity,
    chapter_name: row.chapter_name,
    school: row.school,
    space_type: row.space_type,
    llm_data: row.llm_data,
  };

  const { data: inserted, error } = await supabase.from('spaces').insert(insertPayload).select('id').single();

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: inserted.id, created: true };
}
