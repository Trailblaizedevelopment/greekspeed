export type ApprovalMode = 'auto' | 'pending';
export type InvitationStatus = 'active' | 'expired' | 'deactivated';
export type InvitationType = 'active_member' | 'alumni';

export interface Invitation {
  id: string;
  token: string;
  chapter_id: string;
  created_by: string;
  email_domain_allowlist: string[] | null;
  approval_mode: ApprovalMode;
  single_use: boolean;
  expires_at: string | null;
  usage_count: number;
  max_uses: number | null;
  is_active: boolean;
  invitation_type: InvitationType;
  created_at: string;
  updated_at: string;
  chapter_name?: string; 
}

export interface InvitationUsage {
  id: string;
  invitation_id: string;
  email: string;
  user_id: string | null;
  used_at: string;
  user_name?: string;
}

export interface CreateInvitationData {
  chapter_id: string;
  email_domain_allowlist?: string[];
  approval_mode?: ApprovalMode;
  single_use?: boolean;
  expires_at?: string | null;
  max_uses?: number | null;
  invitation_type?: InvitationType;
}

export interface UpdateInvitationData {
  email_domain_allowlist?: string[];
  approval_mode?: ApprovalMode;
  single_use?: boolean;
  expires_at?: string | null;
  max_uses?: number | null;
  is_active?: boolean;
  invitation_type?: InvitationType;
}

export interface InvitationWithUsage extends Invitation {
  usage: InvitationUsage[];
  chapter_name?: string;
  created_by_name?: string;
  invitation_url?: string;
}

export interface JoinFormData {
  email: string;
  password: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  phone: string;
  sms_consent?: boolean;
  graduation_year: number;
  major: string;
  location?: string;
}

export interface InvitationValidationResult {
  valid: boolean;
  invitation?: Invitation;
  error?: string;
  chapter_name?: string;
}

export interface InvitationStats {
  total_invitations: number;
  active_invitations: number;
  total_usage: number;
  pending_approvals: number;
  recent_invitations: InvitationWithUsage[];
}

export interface AlumniJoinFormData {
  email: string;
  password: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  phone: string;
  sms_consent?: boolean;
  // Alumni-specific fields
  industry: string;
  company: string;
  job_title: string;
  graduation_year: number;
  location: string;
  linkedin_url?: string;
}