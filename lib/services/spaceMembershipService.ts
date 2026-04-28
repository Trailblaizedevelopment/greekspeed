import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * TRA-661: Check if a user has an active membership in a given space.
 * Falls back to profiles.chapter_id for backward compatibility.
 */
export async function hasSpaceMembership(
  supabase: SupabaseClient,
  userId: string,
  spaceId: string
): Promise<boolean> {
  const { data: membership } = await supabase
    .from('space_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('space_id', spaceId)
    .neq('status', 'inactive')
    .maybeSingle();

  if (membership) return true;

  // Fallback: check profiles.chapter_id for users without membership rows
  const { data: profile } = await supabase
    .from('profiles')
    .select('chapter_id')
    .eq('id', userId)
    .maybeSingle();

  return profile?.chapter_id === spaceId;
}

/**
 * TRA-661: Get all space IDs for which a user has active membership.
 * Falls back to profiles.chapter_id if no membership rows exist.
 */
export async function getUserMemberSpaceIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: memberships } = await supabase
    .from('space_memberships')
    .select('space_id')
    .eq('user_id', userId)
    .neq('status', 'inactive');

  if (memberships && memberships.length > 0) {
    return memberships.map((m) => m.space_id);
  }

  // Fallback
  const { data: profile } = await supabase
    .from('profiles')
    .select('chapter_id')
    .eq('id', userId)
    .maybeSingle();

  return profile?.chapter_id ? [profile.chapter_id] : [];
}

/**
 * TRA-661: Upsert a space membership row (e.g. on join/approval).
 *
 * Cannot use PostgREST `.upsert({ onConflict: 'user_id,space_id' })` because the DB only defines a
 * **partial** unique index on (user_id, space_id) WHERE status != 'inactive', which does not satisfy
 * Postgres `ON CONFLICT` inference (42P10).
 */
export async function upsertSpaceMembership(
  supabase: SupabaseClient,
  params: {
    userId: string;
    spaceId: string;
    role: string;
    status: 'active' | 'alumni' | 'inactive';
    isPrimary: boolean;
    /** TRA-665: space picker “icon” membership */
    isSpaceIcon?: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  const updatedAt = new Date().toISOString();

  const { data: existing, error: selectError } = await supabase
    .from('space_memberships')
    .select('id')
    .eq('user_id', params.userId)
    .eq('space_id', params.spaceId)
    .neq('status', 'inactive')
    .maybeSingle();

  if (selectError) {
    console.error('upsertSpaceMembership select error:', selectError);
    return { ok: false, error: selectError.message };
  }

  if (existing?.id) {
    const patch: Record<string, unknown> = {
      role: params.role,
      status: params.status,
      is_primary: params.isPrimary,
      updated_at: updatedAt,
    };
    if (params.isSpaceIcon !== undefined) {
      patch.is_space_icon = params.isSpaceIcon;
    }
    const { error } = await supabase.from('space_memberships').update(patch).eq('id', existing.id);

    if (error) {
      console.error('upsertSpaceMembership update error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  let firstMemberIcon = false;
  if (params.status !== 'inactive') {
    const { count, error: cErr } = await supabase
      .from('space_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', params.spaceId)
      .neq('status', 'inactive');
    if (!cErr && (count ?? 0) === 0) {
      firstMemberIcon = true;
    }
  }
  const isSpaceIcon =
    params.isSpaceIcon !== undefined ? params.isSpaceIcon : firstMemberIcon;

  const { error: insertError } = await supabase.from('space_memberships').insert({
    user_id: params.userId,
    space_id: params.spaceId,
    role: params.role,
    status: params.status,
    is_primary: params.isPrimary,
    is_space_icon: isSpaceIcon,
    created_at: updatedAt,
    updated_at: updatedAt,
  });

  if (insertError) {
    console.error('upsertSpaceMembership insert error:', insertError);
    return { ok: false, error: insertError.message };
  }
  return { ok: true };
}

export type SyncProfileHomeFromPrimaryResult =
  | {
      ok: true;
      previousChapterId: string | null;
      previousChapterLabel: string | null;
      newChapterId: string;
      newChapterLabel: string | null;
    }
  | { ok: false; error: string; previousChapterId: string | null };

/**
 * After `upsertSpaceMembership` with `isPrimary: true`, align the rest of the model:
 * - Clears `is_primary` on this user's other non-inactive memberships (single primary row).
 * - Sets `profiles.chapter_id` to the space UUID and `profiles.chapter` to the space display name.
 *
 * Matches invite / approval flows that treat `chapter_id` as the member’s home space.
 */
export async function syncProfileHomeFromPrimaryMembership(
  supabase: SupabaseClient,
  params: { userId: string; spaceId: string }
): Promise<SyncProfileHomeFromPrimaryResult> {
  const now = new Date().toISOString();

  const { data: beforeProfile, error: beforeErr } = await supabase
    .from('profiles')
    .select('chapter_id, chapter')
    .eq('id', params.userId)
    .maybeSingle();

  if (beforeErr) {
    return { ok: false, error: beforeErr.message, previousChapterId: null };
  }

  const previousChapterId = (beforeProfile?.chapter_id as string | null | undefined) ?? null;
  const previousChapterLabel = (beforeProfile?.chapter as string | null | undefined) ?? null;

  const { error: demoteErr } = await supabase
    .from('space_memberships')
    .update({ is_primary: false, updated_at: now })
    .eq('user_id', params.userId)
    .neq('space_id', params.spaceId)
    .neq('status', 'inactive');

  if (demoteErr) {
    console.error('syncProfileHomeFromPrimaryMembership demote error:', demoteErr);
    return { ok: false, error: demoteErr.message, previousChapterId };
  }

  const { data: space, error: spaceErr } = await supabase
    .from('spaces')
    .select('name')
    .eq('id', params.spaceId)
    .maybeSingle();

  if (spaceErr) {
    console.error('syncProfileHomeFromPrimaryMembership space fetch error:', spaceErr);
    return { ok: false, error: spaceErr.message, previousChapterId };
  }

  const newLabel = (space?.name as string | null | undefined) ?? null;

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      chapter_id: params.spaceId,
      chapter: newLabel,
      updated_at: now,
    })
    .eq('id', params.userId);

  if (profileErr) {
    console.error('syncProfileHomeFromPrimaryMembership profile update error:', profileErr);
    return { ok: false, error: profileErr.message, previousChapterId };
  }

  return {
    ok: true,
    previousChapterId,
    previousChapterLabel: previousChapterLabel,
    newChapterId: params.spaceId,
    newChapterLabel: newLabel,
  };
}
