import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { buildSimulationSpaceRow } from '@/lib/dataSeeds/spaceSeedMapping';
import {
  uploadChapterLogoFromDataUrl,
  upsertPrimaryLogoBrandingForSpace,
} from '@/lib/services/spaceChapterLogoService';

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
    /** Optional directory FKs when inserting a new shell space. */
    school_id?: string | null;
    national_organization_id?: string | null;
    /** Optional JPEG/PNG/GIF data URL — stored as chapter primary logo after insert (new rows only). */
    initial_logo_data_url?: string | null;
    /** Profile id for `chapter_branding` audit columns when seeding a logo. */
    branding_actor_user_id?: string | null;
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

  const insertPayload: Record<string, unknown> = {
    name: row.name,
    slug: row.slug,
    national_fraternity: row.national_fraternity,
    chapter_name: row.chapter_name,
    school: row.school,
    space_type: row.space_type,
    llm_data: row.llm_data,
  };

  const sid = params.school_id?.trim();
  if (sid && z.string().uuid().safeParse(sid).success) {
    insertPayload.school_id = sid;
  }
  const oid = params.national_organization_id?.trim();
  if (oid && z.string().uuid().safeParse(oid).success) {
    insertPayload.national_organization_id = oid;
  }

  const { data: inserted, error } = await supabase.from('spaces').insert(insertPayload).select('id').single();

  if (error) {
    return { ok: false, error: error.message };
  }

  const spaceId = inserted.id as string;
  const logoData = params.initial_logo_data_url?.trim();
  if (logoData) {
    const publicUrl = await uploadChapterLogoFromDataUrl(supabase, spaceId, logoData);
    if (publicUrl) {
      const brand = await upsertPrimaryLogoBrandingForSpace(supabase, {
        spaceId,
        logoPublicUrl: publicUrl,
        spaceDisplayName: row.name,
        actorUserId: params.branding_actor_user_id ?? null,
      });
      if (!brand.ok) {
        console.warn('findOrCreateSpaceFromSimulationLabel: branding logo upsert:', brand.error);
      }
    }
  }

  return { ok: true, id: spaceId, created: true };
}
