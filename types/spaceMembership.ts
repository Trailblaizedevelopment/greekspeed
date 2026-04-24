export type SpaceMembershipStatus = 'active' | 'alumni' | 'inactive';

export interface SpaceMembership {
  id: string;
  user_id: string;
  space_id: string;
  role: string;
  status: SpaceMembershipStatus;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberSpace {
  id: string;
  name: string;
  school?: string | null;
  slug?: string | null;
  is_primary: boolean;
  membership_status: SpaceMembershipStatus;
  membership_role: string;
}
