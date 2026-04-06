import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Pending invitation accept requires profiles.chapter_id = null before createPendingMembershipRequest.
 * DB triggers or other writers can re-assign chapter_id after our upsert; this loop clears until stable.
 */
export async function ensureProfileChapterIdNullForPendingInvite(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; chapter_id: string | null }> {
  const MAX_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: row, error: readError } = await supabase
      .from('profiles')
      .select('chapter_id')
      .eq('id', userId)
      .single();

    if (readError || !row) {
      console.error(
        'ensureProfileChapterIdNullForPendingInvite: read failed',
        readError?.message ?? 'no row'
      );
      return { ok: false, chapter_id: null };
    }

    if (row.chapter_id === null) {
      return { ok: true };
    }

    const { error: updError } = await supabase
      .from('profiles')
      .update({
        chapter_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updError) {
      console.error('ensureProfileChapterIdNullForPendingInvite: update failed', updError.message);
      return { ok: false, chapter_id: row.chapter_id };
    }
  }

  const { data: final } = await supabase
    .from('profiles')
    .select('chapter_id')
    .eq('id', userId)
    .maybeSingle();

  if (final?.chapter_id === null) {
    return { ok: true };
  }

  return { ok: false, chapter_id: final?.chapter_id ?? null };
}

/**
 * Avoid signUp + half-written state when this email already has a profile (e.g. marketing alumni, prior invite).
 * Uses lowercase equality (profiles should store normalized email from signup flows).
 */
export async function findProfileByEmailForInviteAccept(
  supabase: SupabaseClient,
  email: string
): Promise<{ id: string; chapter_id: string | null } | null> {
  const normalized = email.toLowerCase().trim();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, chapter_id')
    .eq('email', normalized)
    .maybeSingle();

  if (error) {
    console.error('findProfileByEmailForInviteAccept:', error.message);
    return null;
  }
  return data ?? null;
}
