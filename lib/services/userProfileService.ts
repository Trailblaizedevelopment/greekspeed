import { supabase } from '@/lib/supabase/client';
import { UnifiedUserProfile, UserProfileType } from '@/types/user-profile';
import { Alumni } from '@/lib/alumniConstants';

// Cache for user profiles (in-memory, cleared on page refresh)
const profileCache = new Map<string, { data: UnifiedUserProfile; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Invalidate profile cache entries
 * Clears cache for a specific user ID and/or slug
 */
export function invalidateProfileCache(userId?: string, slug?: string) {
  if (userId) {
    profileCache.delete(userId);
  }
  if (slug) {
    profileCache.delete(`slug:${slug}`);
  }
  // Clear all slug-based entries if we need to be thorough (optional)
  if (slug) {
    // Clear old slug entries - this is best effort since we might not know old slug
    for (const key of profileCache.keys()) {
      if (key.startsWith('slug:')) {
        profileCache.delete(key);
      }
    }
  }
}

/**
 * Resolve a human-readable chapter name from a chapter UUID.
 * Queries the chapters table; returns null if not found.
 */
async function resolveChapterName(chapterId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('chapters')
      .select('name')
      .eq('id', chapterId)
      .single();
    return data?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch user profile by ID
 * Handles both alumni and regular users
 */
export async function fetchUserProfile(userId: string): Promise<UnifiedUserProfile | null> {
  // Check cache first
  const cached = profileCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // First, check if user is an alumni
    const { data: alumniData, error: alumniError } = await supabase
      .from('alumni')
      .select(`
        *,
        profile:profiles!user_id(
          avatar_url,
          banner_url,
          full_name,
          first_name,
          last_name,
          email,
          phone,
          chapter,
          chapter_id,
          bio,
          location,
          username,
          profile_slug
        )
      `)
      .eq('user_id', userId)
      .single();

    if (alumniData && !alumniError) {
      // Resolve chapter name: prefer the profile's chapter field (human-readable),
      // then look up from chapters table, never show raw UUID
      const chapterId = alumniData.chapter || alumniData.profile?.chapter_id || null;
      let chapterName: string | null = alumniData.profile?.chapter || null;
      if (!chapterName && chapterId) {
        chapterName = await resolveChapterName(chapterId);
      }

      const profile: UnifiedUserProfile = {
        id: userId,
        type: 'alumni',
        full_name: alumniData.full_name || `${alumniData.first_name || ''} ${alumniData.last_name || ''}`.trim(),
        first_name: alumniData.first_name,
        last_name: alumniData.last_name,
        avatar_url: alumniData.avatar_url || alumniData.profile?.avatar_url || null,
        banner_url: alumniData.profile?.banner_url || null,
        email: alumniData.email,
        phone: alumniData.phone,
        chapter: chapterName,
        chapter_id: chapterId,
      bio: alumniData.description || alumniData.profile?.bio || null,
      location: alumniData.location || alumniData.profile?.location || null,
      username: alumniData.profile?.username || null,
      profile_slug: alumniData.profile?.profile_slug || null,
      alumni: {
          industry: alumniData.industry,
          graduationYear: alumniData.graduation_year,
          company: alumniData.company,
          jobTitle: alumniData.job_title,
          is_email_public: alumniData.is_email_public,
          is_phone_public: alumniData.is_phone_public,
          isEmailPublic: alumniData.is_email_public,
          isPhonePublic: alumniData.is_phone_public,
          verified: alumniData.verified,
          isActivelyHiring: alumniData.is_actively_hiring,
          hasProfile: !!alumniData.profile,
          description: alumniData.description,
        }
      };

      // Cache the result
      profileCache.set(userId, { data: profile, timestamp: Date.now() });
      return profile;
    }

    // If not alumni, fetch regular profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profileData) {
      console.error('Error fetching user profile:', profileError);
      return null;
    }

    // Ensure chapter name is human-readable; fall back to chapters table lookup
    let chapterName: string | null = profileData.chapter || null;
    if (!chapterName && profileData.chapter_id) {
      chapterName = await resolveChapterName(profileData.chapter_id);
    }

    const profile: UnifiedUserProfile = {
      id: userId,
      type: 'user',
      full_name: profileData.full_name || 'Unknown User',
      first_name: profileData.first_name,
      last_name: profileData.last_name,
      avatar_url: profileData.avatar_url,
      banner_url: profileData.banner_url || null,
      email: profileData.email,
      phone: profileData.phone,
      chapter: chapterName,
      chapter_id: profileData.chapter_id,
      bio: profileData.bio,
      location: profileData.location,
      username: profileData.username || null,
      profile_slug: profileData.profile_slug || null,
      user: {
        role: profileData.role,
        chapter_role: profileData.chapter_role,
        member_status: profileData.member_status,
        grad_year: profileData.grad_year,
        major: profileData.major,
        minor: profileData.minor,
        linkedin_url: profileData.linkedin_url,
        pledge_class: profileData.pledge_class,
      }
    };

    // Cache the result
    profileCache.set(userId, { data: profile, timestamp: Date.now() });
    return profile;
  } catch (error) {
    console.error('Error in fetchUserProfile:', error);
    return null;
  }
}

/**
 * Convert Alumni object to UnifiedUserProfile.
 * Note: alumni.chapter may be a UUID; callers that need a guaranteed
 * human-readable name should await resolveChapterNameForAlumni() afterwards.
 */
export function alumniToUnifiedProfile(alumni: Alumni): UnifiedUserProfile {
  return {
    id: alumni.id,
    type: 'alumni',
    full_name: alumni.fullName,
    first_name: alumni.firstName,
    last_name: alumni.lastName,
    avatar_url: alumni.avatar || null,
    email: alumni.email || null,
    phone: alumni.phone || null,
    chapter: alumni.chapter || null,
    chapter_id: alumni.chapter,
    bio: alumni.description,
    location: alumni.location,
    alumni: {
      industry: alumni.industry,
      graduationYear: alumni.graduationYear,
      company: alumni.company,
      jobTitle: alumni.jobTitle,
      is_email_public: alumni.is_email_public,
      is_phone_public: alumni.is_phone_public,
      isEmailPublic: alumni.isEmailPublic,
      isPhonePublic: alumni.isPhonePublic,
      verified: alumni.verified,
      isActivelyHiring: alumni.isActivelyHiring,
      lastContact: alumni.lastContact,
      hasProfile: alumni.hasProfile,
      description: alumni.description,
    }
  };
}

/**
 * Fetch user profile by slug (username/profile_slug)
 * Handles both alumni and regular users
 * Works for both authenticated and non-authenticated requests
 */
export async function fetchUserProfileBySlug(slug: string): Promise<UnifiedUserProfile | null> {
  // Check cache first (using slug as key)
  const cacheKey = `slug:${slug}`;
  const cached = profileCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Query profiles table by profile_slug OR username
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .or(`profile_slug.eq.${slug},username.eq.${slug}`)
      .single();

    if (profileError || !profileData) {
      console.error('Error fetching profile by slug:', profileError);
      return null;
    }

    const userId = profileData.id;

    // Check if user is an alumni
    const { data: alumniData, error: alumniError } = await supabase
      .from('alumni')
      .select(`
        *,
        profile:profiles!user_id(
          avatar_url,
          banner_url,
          full_name,
          first_name,
          last_name,
          email,
          phone,
          chapter,
          chapter_id,
          bio,
          location,
          username,
          profile_slug
        )
      `)
      .eq('user_id', userId)
      .single();

    if (alumniData && !alumniError) {
      // Resolve chapter name: prefer the profile's chapter field (human-readable),
      // then look up from chapters table, never show raw UUID
      const chapterId = alumniData.chapter || alumniData.profile?.chapter_id || null;
      let chapterName: string | null = alumniData.profile?.chapter || null;
      if (!chapterName && chapterId) {
        chapterName = await resolveChapterName(chapterId);
      }

      const profile: UnifiedUserProfile = {
        id: userId,
        type: 'alumni',
        full_name: alumniData.full_name || `${alumniData.first_name || ''} ${alumniData.last_name || ''}`.trim(),
        first_name: alumniData.first_name,
        last_name: alumniData.last_name,
        avatar_url: alumniData.avatar_url || alumniData.profile?.avatar_url || null,
        banner_url: alumniData.profile?.banner_url || null,
        email: alumniData.email,
        phone: alumniData.phone,
        chapter: chapterName,
        chapter_id: chapterId,
      bio: alumniData.description || alumniData.profile?.bio || null,
      location: alumniData.location || alumniData.profile?.location || null,
      username: alumniData.profile?.username || null,
      profile_slug: alumniData.profile?.profile_slug || null,
      alumni: {
          industry: alumniData.industry,
          graduationYear: alumniData.graduation_year,
          company: alumniData.company,
          jobTitle: alumniData.job_title,
          is_email_public: alumniData.is_email_public,
          is_phone_public: alumniData.is_phone_public,
          isEmailPublic: alumniData.is_email_public,
          isPhonePublic: alumniData.is_phone_public,
          verified: alumniData.verified,
          isActivelyHiring: alumniData.is_actively_hiring,
          hasProfile: !!alumniData.profile,
          description: alumniData.description,
        }
      };

      // Cache the result (using both userId and slug as keys)
      profileCache.set(cacheKey, { data: profile, timestamp: Date.now() });
      profileCache.set(userId, { data: profile, timestamp: Date.now() });
      return profile;
    }

    // If not alumni, use regular profile
    // Ensure chapter name is human-readable; fall back to chapters table lookup
    let chapterName: string | null = profileData.chapter || null;
    if (!chapterName && profileData.chapter_id) {
      chapterName = await resolveChapterName(profileData.chapter_id);
    }

    const profile: UnifiedUserProfile = {
      id: userId,
      type: 'user',
      full_name: profileData.full_name || 'Unknown User',
      first_name: profileData.first_name,
      last_name: profileData.last_name,
      avatar_url: profileData.avatar_url,
      banner_url: profileData.banner_url || null,
      email: profileData.email,
      phone: profileData.phone,
      chapter: chapterName,
      chapter_id: profileData.chapter_id,
      bio: profileData.bio,
      location: profileData.location,
      username: profileData.username || null,
      profile_slug: profileData.profile_slug || null,
      created_at: profileData.created_at || null,
      user: {
        role: profileData.role,
        chapter_role: profileData.chapter_role,
        member_status: profileData.member_status,
        grad_year: profileData.grad_year,
        major: profileData.major,
        minor: profileData.minor,
        linkedin_url: profileData.linkedin_url,
        pledge_class: profileData.pledge_class,
      }
    };

    // Cache the result (using both userId and slug as keys)
    profileCache.set(cacheKey, { data: profile, timestamp: Date.now() });
    profileCache.set(userId, { data: profile, timestamp: Date.now() });
    return profile;
  } catch (error) {
    console.error('Error in fetchUserProfileBySlug:', error);
    return null;
  }
}

/**
 * Clear cache for a specific user or all users
 */
export function clearProfileCache(userId?: string) {
  if (userId) {
    profileCache.delete(userId);
    // Also clear any slug-based cache entries (would need to track slugs, but for simplicity, clear all)
    // This is acceptable since cache is in-memory and short-lived
  } else {
    profileCache.clear();
  }
}

