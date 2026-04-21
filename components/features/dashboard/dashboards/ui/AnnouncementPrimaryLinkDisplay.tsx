'use client';

import { ExternalLink, Link2 } from 'lucide-react';
import type { AnnouncementPrimaryLink } from '@/types/announcements';
import { cn } from '@/lib/utils';

export interface AnnouncementPrimaryLinkDisplayProps {
  link: AnnouncementPrimaryLink;
  /** Drawer: prominent block. Card/mobile list: single line, stops click bubbling to parent row. */
  variant: 'drawer' | 'card' | 'compact';
}

/**
 * Renders a server-sanitized announcement `primary_link` as a plain `<a>` (no HTML injection).
 */
export function AnnouncementPrimaryLinkDisplay({ link, variant }: AnnouncementPrimaryLinkDisplayProps) {
  const linkText = link.label?.trim() || link.url;
  const stopRowClick = variant === 'card' || variant === 'compact';

  const anchorClass = cn(
    'inline-flex items-center gap-1 font-medium text-brand-primary hover:text-primary-800 underline-offset-2 hover:underline break-all text-left',
    variant === 'drawer' && 'text-sm',
    (variant === 'card' || variant === 'compact') && 'text-xs line-clamp-2'
  );

  const wrapClass = cn(
    variant === 'drawer' &&
      'rounded-lg border border-primary-100/80 bg-primary-50/40 p-3 mb-3 space-y-1.5',
    variant === 'card' && 'mb-2',
    variant === 'compact' && 'mb-2'
  );

  return (
    <div className={wrapClass}>
      {(variant === 'drawer' || variant === 'card') && (
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
          Link
        </div>
      )}
      <div
        className={cn(
          'min-w-0',
          variant === 'compact' && 'flex items-start gap-1.5'
        )}
      >
        {variant === 'compact' && (
          <Link2 className="h-3 w-3 shrink-0 text-slate-400 mt-0.5" aria-hidden />
        )}
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={anchorClass}
          onClick={stopRowClick ? (e) => e.stopPropagation() : undefined}
          onKeyDown={stopRowClick ? (e) => e.stopPropagation() : undefined}
        >
          <span className="min-w-0">{linkText}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          <span className="sr-only"> (opens in new tab)</span>
        </a>
      </div>
      {variant === 'drawer' && Boolean(link.label?.trim()) && (
        <p className="text-xs text-gray-500 break-all">{link.url}</p>
      )}
    </div>
  );
}
