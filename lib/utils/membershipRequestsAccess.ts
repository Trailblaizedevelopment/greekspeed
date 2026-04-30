import { canManageMembers, type ProfileForPermission } from '@/lib/permissions';

/** True if the user should see the membership requests nav entry / page (any manageable context). */
export function canSeeMembershipRequestsNav(
  profile: ProfileForPermission | null | undefined,
  options?: {
    isDeveloper?: boolean;
    activeChapterId?: string | null;
    /** When set, permissions are evaluated for this chapter (e.g. invite settings page). */
    scopeChapterId?: string | null;
  }
): boolean {
  if (!profile?.role) return false;
  if (profile.role === 'governance') return true;
  if (options?.isDeveloper && (options.scopeChapterId || options.activeChapterId)) return true;

  const ctx =
    options?.scopeChapterId ?? options?.activeChapterId ?? profile.chapter_id ?? null;
  if (!ctx) return false;

  if (profile.chapter_id !== ctx) return false;

  return canManageMembers(profile.role, profile.chapter_role);
}
