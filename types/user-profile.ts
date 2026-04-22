import { Alumni } from '@/lib/alumniConstants';
import { Profile } from './profile';

/**
 * Unified user profile type that works for both alumni and regular users
 */
export type UserProfileType = 'alumni' | 'user';

export interface UnifiedUserProfile {
  id: string;
  type: UserProfileType;
  
  // Common fields
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  email?: string | null;
  phone?: string | null;
  chapter?: string | null;
  chapter_id?: string | null;
  bio?: string | null;
  location?: string | null;
  username?: string | null;
  profile_slug?: string | null;
  created_at?: string | null;

  // Alumni-specific fields (optional)
  alumni?: {
    industry?: string;
    graduationYear?: number;
    company?: string;
    jobTitle?: string;
    is_email_public?: boolean;
    is_phone_public?: boolean;
    isEmailPublic?: boolean;
    isPhonePublic?: boolean;
    verified?: boolean;
    isActivelyHiring?: boolean;
    lastContact?: string;
    hasProfile?: boolean;
    description?: string;
  };
  
  // Regular user-specific fields (optional)
  user?: {
    role?: string;
    chapter_role?: string;
    member_status?: string;
    grad_year?: number;
    major?: string;
    minor?: string;
    linkedin_url?: string | null;
    pledge_class?: string | null;
  };
}

/**
 * User profile data that can be passed to the modal
 */
export interface UserProfileData extends Partial<UnifiedUserProfile> {
  id: string;
  type: UserProfileType;
  full_name: string;
}

