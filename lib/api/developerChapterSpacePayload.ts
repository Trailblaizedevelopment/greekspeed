import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

/** PostgREST `or` / `ilike` token: quoted so spaces parse as one value. */
export function postgrestIlikeQuotedPattern(qRaw: string): string | null {
  const q = qRaw.replace(/%/g, '').replace(/,/g, '').replace(/"/g, '').trim().slice(0, 120);
  if (!q) return null;
  const pattern = `%${q}%`;
  return `"${pattern.replace(/"/g, '""')}"`;
}

const chapterCoreSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.union([z.string().max(20000), z.null()]).optional(),
  location: z.string().min(1).max(500),
  member_count: z.coerce.number().int().min(0),
  founded_year: z.coerce.number().int().min(1800).max(2100),
  university: z.string().min(1).max(500),
  slug: z.string().min(1).max(500),
  national_fraternity: z.string().min(1).max(500),
  chapter_name: z.string().min(1).max(500),
  school: z.union([z.string().max(500), z.null()]).optional(),
  school_location: z.union([z.string().max(500), z.null()]).optional(),
  chapter_status: z.union([z.string().max(80), z.null()]).optional(),
  school_id: z.string().uuid().nullish(),
  national_organization_id: z.string().uuid().nullish(),
  space_type: z.union([z.string().max(200), z.null()]).optional(),
  events: z.unknown().optional().nullable(),
  achievements: z.unknown().optional().nullable(),
  llm_enriched: z.boolean().optional(),
  llm_data: z.unknown().optional().nullable(),
  /** After space insert: upsert membership for this user as exclusive Space Icon (active_member). */
  space_icon_user_id: z.string().uuid().optional(),
  /** Optional JPEG/PNG/GIF data URL — uploaded to chapter-logos and set as primary branding logo. */
  space_image_data_url: z.string().max(14_000_000).optional(),
});

export type ParsedChapterCore = z.infer<typeof chapterCoreSchema>;

export function parseChapterCorePayload(body: unknown):
  | { ok: true; data: ParsedChapterCore }
  | { ok: false; error: string } {
  const r = chapterCoreSchema.safeParse(body);
  if (!r.success) {
    const msg = r.error.flatten().formErrors.join('; ') || 'Invalid chapter payload';
    return { ok: false, error: msg };
  }
  return { ok: true, data: r.data };
}

function normUuid(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  return v;
}

/**
 * When `school_id` / `national_organization_id` are set, validates FK rows and
 * overwrites denormalized text fields from directory data (single source of truth).
 */
export async function resolveChapterDirectoryFields(
  service: SupabaseClient,
  input: ParsedChapterCore
): Promise<
  | {
      ok: true;
      university: string;
      school: string | null;
      national_fraternity: string;
      school_location: string | null | undefined;
      school_id: string | null;
      national_organization_id: string | null;
    }
  | { ok: false; status: number; error: string }
> {
  let university = input.university.trim();
  let school = (input.school ?? '').trim() || null;
  let national_fraternity = input.national_fraternity.trim();
  let school_location = input.school_location ?? null;

  const schoolId = normUuid(input.school_id);
  const orgId = normUuid(input.national_organization_id);

  if (schoolId) {
    const { data: s, error } = await service
      .from('schools')
      .select('id,name,short_name,location')
      .eq('id', schoolId)
      .maybeSingle();
    if (error) {
      return { ok: false, status: 500, error: 'Failed to validate school' };
    }
    if (!s) {
      return { ok: false, status: 400, error: 'school_id does not match an existing school' };
    }
    university = (s.name as string).trim();
    const sn = (s.short_name as string | null)?.trim();
    school = sn || school;
    if (!school_location && s.location) {
      school_location = String(s.location).trim();
    }
  }

  if (orgId) {
    const { data: o, error } = await service
      .from('national_organizations')
      .select('id,name,short_name')
      .eq('id', orgId)
      .maybeSingle();
    if (error) {
      return { ok: false, status: 500, error: 'Failed to validate national organization' };
    }
    if (!o) {
      return {
        ok: false,
        status: 400,
        error: 'national_organization_id does not match an existing national organization',
      };
    }
    national_fraternity = (o.name as string).trim();
  }

  return {
    ok: true,
    university,
    school,
    national_fraternity,
    school_location,
    school_id: schoolId,
    national_organization_id: orgId,
  };
}

export function buildSpaceInsertRow(
  core: ParsedChapterCore,
  resolved: {
    university: string;
    school: string | null;
    national_fraternity: string;
    school_location: string | null | undefined;
    school_id: string | null;
    national_organization_id: string | null;
  }
): Record<string, unknown> {
  return {
    name: core.name.trim(),
    description: core.description ?? '',
    location: core.location.trim(),
    member_count: core.member_count,
    founded_year: core.founded_year,
    university: resolved.university,
    slug: core.slug.trim(),
    national_fraternity: resolved.national_fraternity,
    chapter_name: core.chapter_name.trim(),
    school: resolved.school ?? '',
    school_location: resolved.school_location ?? null,
    chapter_status: core.chapter_status?.trim() || 'active',
    school_id: resolved.school_id,
    national_organization_id: resolved.national_organization_id,
    space_type: core.space_type?.trim() || null,
    events: core.events ?? null,
    achievements: core.achievements ?? null,
    llm_enriched: core.llm_enriched ?? false,
    llm_data: core.llm_data ?? null,
  };
}

export function buildSpaceUpdateRow(
  core: ParsedChapterCore,
  resolved: {
    university: string;
    school: string | null;
    national_fraternity: string;
    school_location: string | null | undefined;
    school_id: string | null;
    national_organization_id: string | null;
  }
): Record<string, unknown> {
  return {
    ...buildSpaceInsertRow(core, resolved),
    updated_at: new Date().toISOString(),
  };
}
