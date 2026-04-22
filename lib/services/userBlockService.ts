import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * User IDs the viewer should not see in social surfaces (mutual / enterprise-style):
 * users the viewer blocked, plus users who blocked the viewer.
 */
export async function getHiddenUserIdsForViewer(
  supabase: SupabaseClient,
  viewerUserId: string,
): Promise<string[]> {
  const [{ data: outgoing, error: outgoingError }, { data: incoming, error: incomingError }] =
    await Promise.all([
      supabase.from('user_blocks').select('blocked_user_id').eq('blocker_id', viewerUserId),
      supabase.from('user_blocks').select('blocker_id').eq('blocked_user_id', viewerUserId),
    ]);

  if (outgoingError) {
    console.error('user_blocks (outgoing) fetch error:', outgoingError);
  }
  if (incomingError) {
    console.error('user_blocks (incoming) fetch error:', incomingError);
  }

  const ids = new Set<string>();
  for (const row of outgoing ?? []) {
    const id = row.blocked_user_id as string | undefined;
    if (typeof id === 'string' && id.length > 0) ids.add(id);
  }
  for (const row of incoming ?? []) {
    const id = row.blocker_id as string | undefined;
    if (typeof id === 'string' && id.length > 0) ids.add(id);
  }
  return [...ids];
}

/** `targetUserId` is fully hidden from `viewerUserId` (either direction block). */
export async function isUserHiddenFromViewer(
  supabase: SupabaseClient,
  viewerUserId: string,
  targetUserId: string,
): Promise<boolean> {
  if (viewerUserId === targetUserId) return false;
  const hidden = await getHiddenUserIdsForViewer(supabase, viewerUserId);
  return hidden.includes(targetUserId);
}

/** Supabase `.not('col', 'in', '(a,b)')` fragment; caller must only use when `ids.length > 0`. */
export function supabaseInList(ids: string[]): string {
  return `(${ids.join(',')})`;
}
