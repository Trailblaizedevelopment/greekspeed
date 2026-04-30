/**
 * Values stored in `space_memberships.role` for developer tooling and member-spaces APIs.
 * `status` remains `active` | `alumni` | `inactive`; alumni in that space uses `status === 'alumni'`.
 */
export const SPACE_MEMBERSHIP_ROLE_OPTIONS = [
  'active_member',
  'alumni',
  'admin',
  'governance',
  'developer',
] as const;

export type SpaceMembershipRoleOption = (typeof SPACE_MEMBERSHIP_ROLE_OPTIONS)[number];

const OPTION_SET = new Set<string>(SPACE_MEMBERSHIP_ROLE_OPTIONS);

export function isSpaceMembershipRoleOption(value: string): value is SpaceMembershipRoleOption {
  return OPTION_SET.has(value);
}

/** Maps a chosen per-space role to the `space_memberships.status` column. */
export function spaceMembershipStatusFromRole(role: SpaceMembershipRoleOption): 'active' | 'alumni' {
  return role === 'alumni' ? 'alumni' : 'active';
}

/** Derive display/API membership_role from a DB row (role string + status). */
export function membershipRoleFromSpaceMembershipRow(row: {
  role?: unknown;
  status?: unknown;
}): SpaceMembershipRoleOption {
  const role = typeof row.role === 'string' ? row.role : '';
  if (isSpaceMembershipRoleOption(role)) return role;
  return row.status === 'alumni' ? 'alumni' : 'active_member';
}

export const SPACE_MEMBERSHIP_ROLE_LABELS: Record<SpaceMembershipRoleOption, string> = {
  active_member: 'Active member',
  alumni: 'Alumni',
  admin: 'Admin / Executive (chapter)',
  governance: 'Governance',
  developer: 'Developer (platform)',
};
