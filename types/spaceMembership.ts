export type SpaceMembershipStatus = 'active' | 'alumni' | 'inactive';

export interface SpaceMembership {
  id: string;
  user_id: string;
  space_id: string;
  role: string;
  status: SpaceMembershipStatus;
  is_primary: boolean;
  /** TRA-665: exclusive Space Icon for this space (avatar/face in search & pickers). */
  is_space_icon: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberSpace {
  id: string;
  name: string;
  school?: string | null;
  slug?: string | null;
  /** From chapter_branding.primary_logo_url when present */
  primary_logo_url?: string | null;
  is_primary: boolean;
  /** Present when sourced from space_memberships; false for profile.chapter_id fallback */
  is_space_icon?: boolean;
  membership_status: SpaceMembershipStatus;
  membership_role: string;
}
