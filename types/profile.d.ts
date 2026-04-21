export type SystemRole = 'admin' | 'active_member' | 'alumni' | 'developer' | 'governance';

export type ChapterRole = 
  | 'president'
  | 'vice_president'
  | 'treasurer'
  | 'secretary'
  | 'rush_chair'
  | 'social_chair'
  | 'philanthropy_chair'
  | 'risk_management_chair'
  | 'alumni_relations_chair'
  | 'member'
  | 'pledge'
  | (string & {});

export type MemberStatus = 
  | 'active'
  | 'inactive'
  | 'probation'
  | 'suspended'
  | 'graduated';

export type DeveloperPermission = 
  | 'view_users'
  | 'view_analytics'
  | 'create_endpoints'
  | 'manage_chapters'
  | 'manage_permissions'
  | 'view_system_health'
  | 'manage_onboarding';

export type AccessLevel = 'standard' | 'elevated' | 'admin';

/** Set at account creation; null means legacy or unknown (pre–TRA-568). */
export type SignupChannel = 'marketing_alumni' | 'invitation' | 'chapter_slug';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  chapter: string | null;
  chapter_id: string | null;
  role: SystemRole | null;
  chapter_role: ChapterRole | null;
  member_status: MemberStatus | null;
  pledge_class?: string;
  grad_year?: number;
  major?: string;
  minor?: string;
  gpa?: number;
  hometown?: string;
  bio: string | null;
  phone: string | null;
  sms_consent: boolean;
  location: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  linkedin_url?: string | null; // Add this field
  username?: string | null;
  profile_slug?: string | null;
  created_at: string;
  updated_at: string;
  is_developer?: boolean;
  developer_permissions?: DeveloperPermission[];
  access_level?: AccessLevel;
  welcome_seen?: boolean;
  onboarding_completed?: boolean;
  onboarding_completed_at?: string;
  /** ISO timestamp when user explicitly accepted community / UGC terms (e.g. onboarding). */
  community_terms_accepted_at?: string | null;
  signup_channel?: SignupChannel | null;
}

export interface ProfileFormData {
  first_name?: string;
  last_name?: string;
  username?: string;
  email?: string;
  chapter?: string;
  role?: string;
  bio?: string;
  phone?: string;
  location?: string;
  grad_year?: string;
  major?: string;
  minor?: string;
  hometown?: string;
  gpa?: string;
  avatar_url?: string;
  banner_url?: string;
  welcome_seen?: boolean; // Add this field
}

export interface ProfileCompletion {
  totalFields: number;
  completedFields: number;
  percentage: number;
  missingFields: string[];
}

export interface ImportMemberRow {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  major?: string;
  minor?: string;
  gpa?: number;
  hometown?: string;
  pledge_class?: string;
  grad_year?: number;
  chapter_role?: ChapterRole;
  member_status?: MemberStatus;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{
    row: number;
    email: string;
    error: string;
  }>;
} 

export interface GovernanceChapterRow {
  chapter_id: string;
  created_at?: string;
}