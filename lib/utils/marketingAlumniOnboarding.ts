import type { Profile } from '@/types/profile';
import { supabase } from '@/lib/supabase/client';

/** Set when user finishes the onboarding wizard but chapter exec approval is still pending (TRA-580). */
export function pendingMembershipLocalStorageKey(userId: string): string {
  return `trailblaize_pending_membership_${userId}`;
}

export function isMarketingAlumniAwaitingChapterApproval(
  profile: Pick<Profile, 'signup_channel' | 'chapter_id'> | null | undefined
): boolean {
  return profile?.signup_channel === 'marketing_alumni' && !profile.chapter_id;
}

export function setPendingMembershipFlowAcknowledged(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(pendingMembershipLocalStorageKey(userId), '1');
}

export function clearPendingMembershipFlowAcknowledged(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(pendingMembershipLocalStorageKey(userId));
}

export function hasPendingMembershipFlowAcknowledged(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(pendingMembershipLocalStorageKey(userId)) === '1';
}

/**
 * TRA-582: True if the user has an open marketing-alumni queue row (server/RLS — works on refresh and new devices).
 * On error, returns false so onboarding can fall back to the wizard instead of bricking.
 */
export async function fetchHasPendingMarketingChapterMembershipRequest(
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('chapter_membership_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('source', 'marketing_alumni')
    .limit(1);

  if (error) {
    console.warn('Pending marketing membership request check failed:', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
