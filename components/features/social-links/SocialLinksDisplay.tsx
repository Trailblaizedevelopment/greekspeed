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
  /** When `compact`, center chips horizontally (e.g. profile modal). */
  centered?: boolean;
  /**
   * Max pill links to show when `compact` is true (by `sort_order`, ascending).
   * `undefined` defaults to 3; `null` shows all (no overflow chip).
   */
  maxCompactPills?: number | null;
}

/**
 * Renders a list of social links with platform icons.
 * Hides entirely if the list is empty.
 */
export function SocialLinksDisplay({
  links,
  compact = false,
  includeHidden = false,
  centered = false,
  maxCompactPills,
}: SocialLinksDisplayProps) {
  const displayedLinks = includeHidden ? links : links.filter((l) => l.is_visible);
  if (displayedLinks.length === 0) return null;

  const sortedLinks = [...displayedLinks].sort((a, b) => {
    const sa = a.sort_order ?? 0;
    const sb = b.sort_order ?? 0;
    if (sa !== sb) return sa - sb;
    return String(a.id).localeCompare(String(b.id));
  });

  const compactCap =
    compact && maxCompactPills !== null
      ? Math.max(1, maxCompactPills ?? 3)
      : null;
  const visibleLinks =
    compactCap != null && sortedLinks.length > compactCap
      ? sortedLinks.slice(0, compactCap)
      : sortedLinks;
  const overflowCount = sortedLinks.length - visibleLinks.length;
  const overflowLabels = overflowCount > 0
    ? sortedLinks
        .slice(visibleLinks.length)
        .map((l) => PLATFORM_LABELS[l.platform as SocialPlatform] || l.platform)
        .join(', ')
    : '';

  return (
    <div
      className={
        compact
          ? `flex flex-wrap gap-2${centered ? ' justify-center' : ''}`
          : centered
            ? 'flex flex-col items-center gap-2'
            : 'space-y-2'
      }
    >
      {visibleLinks.map((link) => (
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
      {compact && overflowCount > 0 && (
        <span
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500"
          title={overflowLabels ? `Also: ${overflowLabels}` : undefined}
          aria-label={`${overflowCount} more social links: ${overflowLabels}`}
        >
          +{overflowCount} more
        </span>
      )}
    </div>
  );
}
