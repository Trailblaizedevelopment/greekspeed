import type { MemberSpaceSummary } from '@/lib/contexts/ActiveChapterContext';

type ProfileRoleFields = {
  role: string | null;
  chapter_id: string | null;
};

/**
 * Resolves which `profiles.role`-style string should drive dashboard gates for the
 * currently selected space (multi-membership): e.g. home `admin` vs alumni in another chapter.
 */
export function resolveEffectiveRoleForActiveContext(
  profile: ProfileRoleFields | null | undefined,
  activeChapterId: string | null,
  memberSpaces: MemberSpaceSummary[]
): string | null {
  if (!profile?.role) return null;
  if (profile.role === 'governance') return 'governance';
  if (profile.role === 'developer') return 'developer';

  const ctxChapter = activeChapterId ?? profile.chapter_id;
  if (!ctxChapter) return profile.role;

  const spaceRow = memberSpaces.find((m) => m.id === ctxChapter);
  if (spaceRow?.membership_status === 'alumni') {
    return 'alumni';
  }
  if (spaceRow?.membership_status === 'active') {
    if (profile.chapter_id === ctxChapter && profile.role === 'admin') return 'admin';
    return 'active_member';
  }

  if (profile.chapter_id === ctxChapter) {
    return profile.role;
  }

  if (profile.role === 'admin') {
    return 'active_member';
  }
  return profile.role;
}
