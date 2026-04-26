'use client';

import { ExternalLink } from 'lucide-react';
import type { ProfileSocialLink } from '@/types/socialLink';
import { PLATFORM_LABELS, type SocialPlatform } from '@/types/socialLink';
import { SocialPlatformIcon } from './SocialPlatformIcon';

interface SocialLinksDisplayProps {
  links: ProfileSocialLink[];
  compact?: boolean;
  /** Owner / preview: show links even when `is_visible` is false. */
  includeHidden?: boolean;
}

/**
 * Renders a list of social links with platform icons.
 * Hides entirely if the list is empty.
 */
export function SocialLinksDisplay({ links, compact = false, includeHidden = false }: SocialLinksDisplayProps) {
  const displayedLinks = includeHidden ? links : links.filter((l) => l.is_visible);
  if (displayedLinks.length === 0) return null;

  return (
    <div className={compact ? 'flex flex-wrap gap-2' : 'space-y-2'}>
      {displayedLinks.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={
            compact
              ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 transition-colors'
              : 'flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors group'
          }
          title={link.label || PLATFORM_LABELS[link.platform as SocialPlatform] || link.platform}
        >
          <SocialPlatformIcon platform={link.platform as SocialPlatform} className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">
            {link.label || link.handle || PLATFORM_LABELS[link.platform as SocialPlatform] || link.platform}
          </span>
          {!compact && (
            <ExternalLink className="h-3 w-3 text-gray-400 group-hover:text-gray-600 flex-shrink-0 ml-auto" />
          )}
        </a>
      ))}
    </div>
  );
}
