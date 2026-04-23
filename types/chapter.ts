import { ChapterRole, MemberStatus } from '@/types/profile';
import { ChapterFeatureFlags } from '@/types/featureFlags';

export interface Chapter {
  id: string;
  name: string;
  national_fraternity: string;
  chapter_name: string;
  school: string;
  school_location?: string;
  description?: string;
  location?: string;
  university?: string;
  slug?: string;
  member_count?: number;
  founded_year?: number;
  founded_date?: string;
  chapter_status: 'active' | 'inactive' | 'suspended';
  events?: string[];
  achievements?: string[];
  llm_enriched?: boolean;
  llm_data?: Record<string, any>;
  starting_budget?: number;
  feature_flags?: ChapterFeatureFlags;
  created_at: string;
  updated_at: string;
}

// This interface matches what LinkedInStyleChapterCard expects
export interface ChapterMember {
  id: string;
  name: string;
  year?: string; // Make optional
  major?: string; // Make optional
  position?: string; // Make optional
  interests?: string[]; // Make interests optional
  avatar?: string;
  verified: boolean;
  mutualConnections: Array<{
    id: string; // ✅ Add this
    name: string;
    avatar?: string;
  }>;
  mutualConnectionsCount: number;
  description: string;
}

// This interface matches the database view data
export interface ChapterMemberData {
  id: string;
  email: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  chapter: string | null;
  role: string | null;
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
  location: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  // Chapter information
  chapter_id: string;
  chapter_name: string;
  chapter_description?: string;
  chapter_location?: string;
  chapter_university?: string;
  chapter_slug?: string;
  chapter_founded_year?: number;
}

export interface ChapterStats {
  totalMembers: number;
  activeMembers: number;
  officers: number;
  events: number;
  alumniConnections: number;
} 