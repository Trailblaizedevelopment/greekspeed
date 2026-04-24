'use client';

import { useProfile } from '@/lib/contexts/ProfileContext';
import { useActiveChapter } from '@/lib/contexts/ActiveChapterContext';

/**
 * Returns the "effective" chapter id for the current UI.
 *
 * - Multi-member users: if they selected a chapter via ChapterSwitcher: `activeChapterId`,
 *   otherwise: `profile.chapter_id` (primary) or null
 * - Developers / Governance:
 *   - if they selected a chapter via ChapterSwitcher: `activeChapterId`
 *   - otherwise: `profile.chapter_id` (if any) or null
 * - Single-chapter normal users: their own `profile.chapter_id`
 *
 * TRA-661: Extended to support multi-space membership. When `hasMultipleMemberships`
 * is true in the ActiveChapterContext, the user gets the same switching behavior
 * as developers/governance.
 */
export function useScopedChapterId(): string | null {
  const { profile, isDeveloper } = useProfile();
  const { activeChapterId, hasMultipleMemberships } = useActiveChapter();

  const isGovernance = profile?.role === 'governance';
  if (isDeveloper || isGovernance || hasMultipleMemberships) {
    return activeChapterId ?? profile?.chapter_id ?? null;
  }

  return profile?.chapter_id ?? null;
}
