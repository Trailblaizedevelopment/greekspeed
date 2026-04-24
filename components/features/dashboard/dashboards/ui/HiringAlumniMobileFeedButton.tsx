'use client';

import { useRouter } from 'next/navigation';
import { useHiringAlumniCount } from '@/lib/hooks/useHiringAlumniCount';

/**
 * Pill CTA (matches SendAnnouncementButton). Parent should wrap with `px-4 sm:hidden`
 * so it aligns with dashboard gutters inside SocialFeed’s mobile full-bleed.
 * Renders nothing when count is 0 or while loading / missing chapter.
 */
export function HiringAlumniMobileFeedButton() {
  const router = useRouter();
  const { count, loading } = useHiringAlumniCount();

  if (loading || count === null || count === 0) {
    return null;
  }

  const handleClick = () => {
    router.push('/dashboard/alumni?activelyHiring=true');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-primary px-4 py-3 shadow-md transition-colors duration-200 hover:bg-brand-primary-hover"
      aria-label={`${count} alumni in your chapter are hiring. Open alumni directory.`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 tabular-nums">
        <span
          className={
            count > 99
              ? 'text-[10px] font-semibold leading-none text-white'
              : count > 9
                ? 'text-[11px] font-semibold leading-none text-white'
                : 'text-sm font-semibold text-white'
          }
        >
          {count > 999 ? '999+' : count}
        </span>
      </div>
      <span className="text-sm font-medium text-white">Alumni Hiring</span>
    </button>
  );
}
