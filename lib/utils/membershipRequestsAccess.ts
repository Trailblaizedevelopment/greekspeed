import { canManageMembers, type ProfileForPermission } from '@/lib/permissions';

/** True if the user should see the membership requests nav entry / page (any manageable context). */
export function canSeeMembershipRequestsNav(
  profile: ProfileForPermission | null | undefined,
  options?: { isDeveloper?: boolean; activeChapterId?: string | null }
): boolean {
  if (!profile?.role) return false;
  if (profile.role === 'admin') return true;
  if (profile.role === 'governance') return true;
  if (options?.isDeveloper && options.activeChapterId) return true;
  if (profile.chapter_id && canManageMembers(profile.role, profile.chapter_role)) {
    return true;
  }
  return false;
}
