import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getManagedChapterIds } from '@/lib/services/governanceService';

export type ProfileChapterReadGate = {
  chapter_id: string | null;
  signup_channel: string | null;
  is_developer: boolean | null;
};

export function isMarketingAlumniPendingHomeChapter(
  profile: Pick<ProfileChapterReadGate, 'signup_channel' | 'chapter_id'>
): boolean {
  return profile.signup_channel === 'marketing_alumni' && !profile.chapter_id;
}

/** No chapter yet: marketing signup or invitation with exec approval pending (TRA-594/595). */
export function isPendingHomeChapterAssignment(
  profile: Pick<ProfileChapterReadGate, 'signup_channel' | 'chapter_id'>
): boolean {
  return (
    !profile.chapter_id &&
    (profile.signup_channel === 'marketing_alumni' ||
      profile.signup_channel === 'invitation')
  );
}

/**
 * TRA-584: Authenticated reads of another chapter’s data (feed, events, etc.).
 * Developers may traverse any chapter; marketing alumni without an assigned chapter may not.
 */
export async function assertAuthenticatedChapterReadAccess(
  supabase: SupabaseClient,
  userId: string,
  profile: ProfileChapterReadGate,
  chapterId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (profile.is_developer === true) {
    return { ok: true };
  }

  if (isPendingHomeChapterAssignment(profile)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Chapter membership is pending approval' },
        { status: 403 }
      ),
    };
  }

  if (profile.chapter_id === chapterId) {
    return { ok: true };
  }

  const managedIds = await getManagedChapterIds(supabase, userId);
  if (managedIds.length > 0 && managedIds.includes(chapterId)) {
    return { ok: true };
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: 'Insufficient permissions to view this chapter' },
      { status: 403 }
    ),
  };
}
