import { useProfile } from '@/lib/contexts/ProfileContext';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useActiveChapter } from '@/lib/contexts/ActiveChapterContext';
import { resolveEffectiveRoleForActiveContext } from '@/lib/utils/effectiveDashboardRole';

export function useRoleAccess(allowedRoles: string[]) {
  const { profile, loading, isDeveloper } = useProfile();
  const { activeChapterId, memberSpaces } = useActiveChapter();
  const router = useRouter();

  const effectiveRole = useMemo(
    () => resolveEffectiveRoleForActiveContext(profile, activeChapterId, memberSpaces),
    [profile, activeChapterId, memberSpaces]
  );

  useEffect(() => {
    if (isDeveloper && activeChapterId) {
      return;
    }

    if (!loading && effectiveRole && !allowedRoles.includes(effectiveRole)) {
      router.push('/dashboard');
    }
  }, [effectiveRole, loading, isDeveloper, activeChapterId, allowedRoles, router]);

  return {
    profile,
    loading,
    hasAccess:
      (isDeveloper && !!activeChapterId) ||
      (!!effectiveRole && allowedRoles.includes(effectiveRole)),
  };
}
