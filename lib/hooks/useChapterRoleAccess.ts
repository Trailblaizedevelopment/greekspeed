import { useProfile } from '@/lib/contexts/ProfileContext';
import { useActiveChapter } from '@/lib/contexts/ActiveChapterContext';
import { ChapterRole } from '@/types/profile';
import { resolveEffectiveRoleForActiveContext } from '@/lib/utils/effectiveDashboardRole';

export function useChapterRoleAccess(allowedChapterRoles: ChapterRole[]) {
  const { profile, loading } = useProfile();
  const { activeChapterId, memberSpaces } = useActiveChapter();

  const effectiveRole = resolveEffectiveRoleForActiveContext(
    profile,
    activeChapterId,
    memberSpaces
  );

  const hasChapterRoleAccess = () => {
    if (!profile) return false;

    if (effectiveRole === 'admin') return true;

    if (profile.chapter_role && allowedChapterRoles.includes(profile.chapter_role)) {
      const ctx = activeChapterId ?? profile.chapter_id;
      if (ctx && profile.chapter_id === ctx) {
        return true;
      }
    }

    return false;
  };

  return {
    profile,
    loading,
    hasChapterRoleAccess: hasChapterRoleAccess(),
    canAddMembers: hasChapterRoleAccess(),
  };
}
