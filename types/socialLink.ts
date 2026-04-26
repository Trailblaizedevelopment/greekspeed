/**
 * Supported social platforms for profile links.
 */
export const SOCIAL_PLATFORMS = [
  'instagram',
  'x',
  'linkedin',
  'tiktok',
  'youtube',
  'website',
  'other',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/**
 * Human-readable labels for each platform.
 */
export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  website: 'Website',
  other: 'Other',
};

/**
 * Expected hostnames per platform (used for optional validation hints).
 * `null` means any host is acceptable.
 */
export const PLATFORM_HOSTS: Record<SocialPlatform, string[] | null> = {
  instagram: ['instagram.com', 'www.instagram.com'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
  linkedin: ['linkedin.com', 'www.linkedin.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com'],
  youtube: ['youtube.com', 'www.youtube.com', 'youtu.be'],
  website: null,
  other: null,
};

/**
 * Row from `profile_social_links` as stored in the database.
 */
export interface ProfileSocialLink {
  id: string;
  user_id: string;
  platform: SocialPlatform;
  url: string;
  handle: string | null;
  label: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Shape used by the edit-profile form before persisting.
 * `id` is optional for new (unsaved) links.
 */
export interface SocialLinkFormItem {
  id?: string;
  platform: SocialPlatform;
  url: string;
  handle?: string;
  label?: string;
  sort_order: number;
  is_visible: boolean;
}

/**
 * Payload accepted by the social-links upsert API.
 */
export interface SocialLinksUpdatePayload {
  links: SocialLinkFormItem[];
}
