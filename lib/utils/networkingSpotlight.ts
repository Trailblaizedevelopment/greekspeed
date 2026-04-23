import { ChapterMemberData } from '@/types/chapter';
import { calculateProfileCompleteness } from './profileCompleteness';
import { Profile } from '@/types/profile';

/**
 * Check if avatar URL is valid and not empty
 */
function hasValidAvatar(avatarUrl: string | null | undefined): boolean {
    return !!(avatarUrl && avatarUrl.trim() !== '');
}

/**
 * Calculate combined priority score for Networking Spotlight.
 * Higher score = more likely to appear first.
 *
 * Activity-based weighting removed (TRA-532). Score is now based on
 * profile completeness (100%) plus an avatar bonus.
 */
export function calculateNetworkingPriority(member: ChapterMemberData): number {
  const profileData: Profile = {
    id: member.id,
    email: member.email,
    full_name: member.full_name,
    first_name: member.first_name,
    last_name: member.last_name,
    chapter: member.chapter,
    chapter_id: member.chapter_id,
    role: member.role as any,
    chapter_role: member.chapter_role,
    member_status: member.member_status,
    grad_year: member.grad_year,
    major: member.major,
    minor: member.minor,
    gpa: member.gpa,
    hometown: member.hometown,
    bio: member.bio,
    phone: member.phone,
    location: member.location,
    avatar_url: member.avatar_url,
    created_at: member.created_at,
    updated_at: member.updated_at,
    sms_consent: false,
    pledge_class: member.pledge_class
  };
  
  const completeness = calculateProfileCompleteness(profileData);
  const completenessScore = completeness.percentage; // 0-100
  
  const avatarBonus = hasValidAvatar(member.avatar_url) ? 40 : 0;
  
  const combinedScore = completenessScore + avatarBonus;
  
  return Math.min(combinedScore, 100);
}
