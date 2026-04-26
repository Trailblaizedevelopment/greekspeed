import {
  SOCIAL_PLATFORMS,
  PLATFORM_HOSTS,
  type SocialPlatform,
  type SocialLinkFormItem,
} from '@/types/socialLink';

const BLOCKED_SCHEMES = ['javascript:', 'data:', 'file:', 'vbscript:'];

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate and sanitize a single social link URL.
 *
 * Rules:
 * - Must be a valid URL
 * - Must use https (http tolerated but normalised to https)
 * - Blocked schemes rejected
 * - If the platform has known hosts, the hostname must match
 */
export function validateSocialUrl(
  url: string,
  platform: SocialPlatform
): ValidationResult {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, error: 'URL is required' };
  }

  // Block dangerous schemes
  const lower = trimmed.toLowerCase();
  for (const scheme of BLOCKED_SCHEMES) {
    if (lower.startsWith(scheme)) {
      return { valid: false, error: 'Invalid URL scheme' };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Require http(s)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, error: 'URL must use HTTPS' };
  }

  // Platform-specific hostname check
  const allowedHosts = PLATFORM_HOSTS[platform];
  if (allowedHosts) {
    const hostname = parsed.hostname.toLowerCase();
    if (!allowedHosts.includes(hostname)) {
      return {
        valid: false,
        error: `URL must be from ${allowedHosts[0].replace('www.', '')}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Normalise a social URL: trim, ensure https.
 */
export function normalizeSocialUrl(url: string): string {
  let trimmed = url.trim();
  if (trimmed.startsWith('http://')) {
    trimmed = trimmed.replace('http://', 'https://');
  }
  // Remove trailing slash for consistency
  return trimmed.replace(/\/+$/, '');
}

/**
 * Validate that a platform string is a known platform.
 */
export function isValidPlatform(platform: string): platform is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(platform);
}

/**
 * Validate an entire list of social link form items.
 * Returns a map of index -> error message for invalid items.
 */
export function validateSocialLinks(
  links: SocialLinkFormItem[]
): Map<number, string> {
  const errors = new Map<number, string>();

  for (let i = 0; i < links.length; i++) {
    const link = links[i];

    if (!isValidPlatform(link.platform)) {
      errors.set(i, 'Invalid platform');
      continue;
    }

    const urlResult = validateSocialUrl(link.url, link.platform);
    if (!urlResult.valid) {
      errors.set(i, urlResult.error || 'Invalid URL');
    }
  }

  return errors;
}
