import type { SupabaseClient } from '@supabase/supabase-js';

type SpaceRow = {
  id: string;
  name: string;
  slug: string | null;
  school: string | null;
  space_type: string | null;
};

export type DeveloperSpaceSearchResult = {
  id: string;
  name: string;
  slug: string | null;
  school: string | null;
  space_type: string | null;
  icon_user_id: string | null;
  icon_avatar_url: string | null;
  icon_display_name: string | null;
};

/**
 * Search spaces (name/slug/school) and attach icon / first-member display via service-role joins.
 */
export async function searchSpacesWithIconsForDeveloper(
  supabase: SupabaseClient,
  q: string,
  limit: number
): Promise<{ ok: true; spaces: DeveloperSpaceSearchResult[] } | { ok: false; error: string }> {
  const safe = q.replace(/%/g, '').slice(0, 120);
  const pattern = `%${safe}%`;

  const [byName, bySlug, bySchool] = await Promise.all([
    supabase.from('spaces').select('id,name,slug,school,space_type').ilike('name', pattern).limit(limit),
    supabase.from('spaces').select('id,name,slug,school,space_type').ilike('slug', pattern).limit(limit),
    supabase.from('spaces').select('id,name,slug,school,space_type').ilike('school', pattern).limit(limit),
  ]);

  const err = byName.error || bySlug.error || bySchool.error;
  if (err) {
    return { ok: false, error: err.message };
  }

  const merged = new Map<string, SpaceRow>();
  for (const row of [...(byName.data ?? []), ...(bySlug.data ?? []), ...(bySchool.data ?? [])]) {
    merged.set(row.id, row);
  }
  const list = [...merged.values()].slice(0, limit);
  if (list.length === 0) {
    return { ok: true, spaces: [] };
  }

  const spaceIds = list.map((s) => s.id);

  const { data: iconMemberships } = await supabase
    .from('space_memberships')
    .select('space_id,user_id')
    .in('space_id', spaceIds)
    .eq('is_space_icon', true)
    .neq('status', 'inactive');

  const iconUserBySpace = new Map<string, string>();
  for (const m of iconMemberships ?? []) {
    if (!iconUserBySpace.has(m.space_id)) iconUserBySpace.set(m.space_id, m.user_id);
  }

  const { data: allMembers } = await supabase
    .from('space_memberships')
    .select('space_id,user_id,created_at')
    .in('space_id', spaceIds)
    .neq('status', 'inactive');

  const sorted = [...(allMembers ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const firstUserBySpace = new Map<string, string>();
  for (const m of sorted) {
    if (!firstUserBySpace.has(m.space_id)) firstUserBySpace.set(m.space_id, m.user_id);
  }

  const userIds = new Set<string>();
  for (const s of list) {
    const uid = iconUserBySpace.get(s.id) ?? firstUserBySpace.get(s.id) ?? null;
    if (uid) userIds.add(uid);
  }

  const profileById = new Map<
    string,
    { avatar_url: string | null; full_name: string | null; first_name: string | null; last_name: string | null }
  >();
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id,avatar_url,full_name,first_name,last_name')
      .in('id', [...userIds]);

    for (const p of profiles ?? []) {
      profileById.set(p.id, {
        avatar_url: p.avatar_url ?? null,
        full_name: p.full_name ?? null,
        first_name: p.first_name ?? null,
        last_name: p.last_name ?? null,
      });
    }
  }

  const spacesOut: DeveloperSpaceSearchResult[] = list.map((s) => {
    const iconUid = iconUserBySpace.get(s.id) ?? firstUserBySpace.get(s.id) ?? null;
    const prof = iconUid ? profileById.get(iconUid) : undefined;
    const display =
      prof?.full_name?.trim() ||
      [prof?.first_name, prof?.last_name].filter(Boolean).join(' ').trim() ||
      null;
    return {
      id: s.id,
      name: s.name,
      slug: s.slug ?? null,
      school: s.school ?? null,
      space_type: s.space_type ?? null,
      icon_user_id: iconUid,
      icon_avatar_url: prof?.avatar_url ?? null,
      icon_display_name: display,
    };
  });

  return { ok: true, spaces: spacesOut };
}
