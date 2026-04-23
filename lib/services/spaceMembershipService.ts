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
  const { error } = await supabase
    .from('space_memberships')
    .upsert(
      {
        user_id: params.userId,
        space_id: params.spaceId,
        role: params.role,
        status: params.status,
        is_primary: params.isPrimary,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,space_id' }
    );

  if (error) {
    console.error('upsertSpaceMembership error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
