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
    const { error } = await supabase
      .from('space_memberships')
      .update({
        role: params.role,
        status: params.status,
        is_primary: params.isPrimary,
        updated_at: updatedAt,
      })
      .eq('id', existing.id);

    if (error) {
      console.error('upsertSpaceMembership update error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  const { error: insertError } = await supabase.from('space_memberships').insert({
    user_id: params.userId,
    space_id: params.spaceId,
    role: params.role,
    status: params.status,
    is_primary: params.isPrimary,
    created_at: updatedAt,
    updated_at: updatedAt,
  });

  if (insertError) {
    console.error('upsertSpaceMembership insert error:', insertError);
    return { ok: false, error: insertError.message };
  }
  return { ok: true };
}
