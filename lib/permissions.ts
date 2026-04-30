import { SystemRole, ChapterRole } from '@/types/profile';

/** Minimal profile shape needed for context-aware permission checks (e.g. governance + chapterId). */
export type ProfileForPermission = {
  role: SystemRole | null;
  chapter_id: string | null;
  chapter_role: ChapterRole | null;
};

export const CHAPTER_ADMIN_ROLES: ChapterRole[] = [
  'president',
  'vice_president',
  'treasurer',
  'secretary'
];

export const EXECUTIVE_ROLES: ChapterRole[] = [
  ...CHAPTER_ADMIN_ROLES,
  'rush_chair',
  'social_chair',
  'philanthropy_chair',
  'risk_management_chair',
  'alumni_relations_chair'
];

export function canManageChapter(userRole: SystemRole, userChapterRole: ChapterRole | null): boolean {
  // Super admins can manage everything
  if (userRole === 'admin') return true;

  // Chapter admins can manage their chapter
  if (userChapterRole && CHAPTER_ADMIN_ROLES.includes(userChapterRole)) return true;

  return false;
}

export function canManageMembers(userRole: SystemRole, userChapterRole: ChapterRole | null): boolean {
  // Super admins can manage all members
  if (userRole === 'admin') return true;

  // Chapter admins can manage their chapter members
  if (userChapterRole && CHAPTER_ADMIN_ROLES.includes(userChapterRole)) return true;

  return false;
}

/**
 * Check if the user can manage the given chapter, including governance with a managed set.
 * Use in API routes when you have profile, chapterId, and (for governance) managedChapterIds.
 */
export function canManageChapterForContext(
  profile: ProfileForPermission | null,
  chapterId: string,
  managedChapterIds?: string[]
): boolean {
  if (!profile?.role) return false;
  // Chapter exec `admin` applies only to the user's home chapter (`profiles.chapter_id`),
  // not every space they can open via multi-membership (see TRA-661 follow-up).
  if (profile.role === 'governance') {
    if (managedChapterIds == null) return false;
    return managedChapterIds.includes(chapterId) || profile.chapter_id === chapterId;
  }
  return profile.chapter_id === chapterId && canManageChapter(profile.role, profile.chapter_role);
}

/**
 * Check if the user can manage members of the given chapter, including governance with a managed set.
 */
export function canManageMembersForContext(
  profile: ProfileForPermission | null,
  chapterId: string,
  managedChapterIds?: string[]
): boolean {
  if (!profile?.role) return false;
  if (profile.role === 'governance') {
    if (managedChapterIds == null) return false;
    return managedChapterIds.includes(chapterId) || profile.chapter_id === chapterId;
  }
  return profile.chapter_id === chapterId && canManageMembers(profile.role, profile.chapter_role);
}

export function canViewChapterData(userRole: SystemRole, userChapterRole: ChapterRole | null): boolean {
  // Anyone with any role can view chapter data
  return true;
}

export function getRoleDisplayName(role: ChapterRole): string {
  const roleNames: Record<string, string> = {
    president: 'President',
    vice_president: 'Vice President',
    treasurer: 'Treasurer',
    secretary: 'Secretary',
    rush_chair: 'Rush Chair',
    social_chair: 'Social Chair',
    philanthropy_chair: 'Philanthropy Chair',
    risk_management_chair: 'Risk Management Chair',
    alumni_relations_chair: 'Alumni Relations Chair',
    member: 'Member',
    pledge: 'Pledge',
  };
  if (role in roleNames) return roleNames[role as string];
  return role
    ? (role as string).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Member';
}