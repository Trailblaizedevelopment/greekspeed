'use client';

import { Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ANNOUNCEMENT_PRIMARY_LINK_LABEL_MAX } from '@/lib/validation/announcementMetadata';

export interface AnnouncementPrimaryLinkFieldsProps {
  url: string;
  label: string;
  onUrlChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  /** Unique suffix for input ids (e.g. `overview`, `mobile`, `governance-broadcast-desktop`). */
  idSuffix: string;
  disabled?: boolean;
  /** Tighter spacing for mobile sheet layouts. */
  compact?: boolean;
}

/** Returns true if `url` is empty (optional field) or a valid https URL. */
export function isValidHttpsAnnouncementLinkInput(url: string): boolean {
  const t = url.trim();
  if (!t) return true;
  try {
    return new URL(t).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Optional single HTTPS link + label for announcement metadata (`primary_link`).
 * Used by Overview, SendAnnouncementButton, and Governance broadcast composers.
 */
export function AnnouncementPrimaryLinkFields({
  url,
  label,
  onUrlChange,
  onLabelChange,
  idSuffix,
  disabled,
  compact,
}: AnnouncementPrimaryLinkFieldsProps) {
  const trimmedUrl = url.trim();
  const showHttpsHint =
    trimmedUrl.length > 0 && !trimmedUrl.toLowerCase().startsWith('https://');

  return (
    <div
      className={cn(
        'rounded-lg border border-gray-100 bg-gray-50/60',
        compact ? 'p-2.5 space-y-2' : 'p-3 space-y-2.5'
      )}
    >
      <div className="flex items-center gap-1.5">
        <Link2 className={cn('shrink-0 text-gray-400', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        <p
          className={cn(
            'font-semibold text-gray-500 uppercase tracking-wide',
            compact ? 'text-[10px]' : 'text-xs'
          )}
        >
          Optional link
        </p>
      </div>
      <p className={cn('text-gray-500', compact ? 'text-[11px] leading-snug' : 'text-xs leading-relaxed')}>
        One HTTPS link for SMS/email CTAs when enabled. Leave blank if you only need text in the body.
      </p>
      <div className="space-y-1">
        <Label
          htmlFor={`announcement-primary-link-url-${idSuffix}`}
          className={cn('text-gray-600', compact ? 'text-[11px]' : 'text-xs')}
        >
          Link URL
        </Label>
        <Input
          id={`announcement-primary-link-url-${idSuffix}`}
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://..."
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={disabled}
          className="border-gray-200 focus:border-brand-primary focus:ring-brand-primary"
        />
        {showHttpsHint && (
          <p className="text-xs text-amber-800" role="status">
            Use an https:// link so it can be sent through notifications.
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label
          htmlFor={`announcement-primary-link-label-${idSuffix}`}
          className={cn('text-gray-600', compact ? 'text-[11px]' : 'text-xs')}
        >
          Link label (optional)
        </Label>
        <Input
          id={`announcement-primary-link-label-${idSuffix}`}
          placeholder="e.g. RSVP form"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          disabled={disabled}
          maxLength={ANNOUNCEMENT_PRIMARY_LINK_LABEL_MAX}
          className="border-gray-200 focus:border-brand-primary focus:ring-brand-primary"
        />
      </div>
    </div>
  );
}
