import type { ChapterRole } from '@/types/profile';
import { EXECUTIVE_ROLES } from '@/lib/permissions';

/** Profile fields used to decide list/detail visibility for chapter events. */
export type EventAudienceViewer = {
  role: string | null;
  chapter_role: string | null;
  is_developer?: boolean | null;
};

export type EventAudienceFlags = {
  visible_to_active_members?: boolean | null;
  visible_to_alumni?: boolean | null;
};

export function viewerBypassesEventAudienceFilter(viewer: EventAudienceViewer): boolean {
  if (viewer.is_developer) return true;
  if (viewer.role === 'admin') return true;
  if (viewer.role === 'governance') return true;
  if (viewer.role === 'active_member' && viewer.chapter_role) {
    return EXECUTIVE_ROLES.includes(viewer.chapter_role as ChapterRole);
  }
  return false;
}

/**
 * Whether a chapter event should appear for this viewer (ignoring exec/developer bypass).
 */
export function eventMatchesViewerAudience(event: EventAudienceFlags, viewer: EventAudienceViewer): boolean {
  // Treat missing as both true (legacy rows / partial selects)
  const showActive = event.visible_to_active_members ?? true;
  const showAlumni = event.visible_to_alumni ?? true;

  if (viewer.role === 'alumni') {
    return showAlumni;
  }
  if (viewer.role === 'active_member') {
    return showActive;
  }
  return false;
}

/**
 * Filter event rows for list responses.
 * @param viewer null = unauthenticated (e.g. public profile sidebar): only events visible to both segments.
 */
export function filterEventsForAudience<T extends EventAudienceFlags>(
  events: T[] | null | undefined,
  viewer: EventAudienceViewer | null
): T[] {
  if (!events?.length) return [];
  if (!viewer) {
    return events.filter((e) => (e.visible_to_active_members ?? true) && (e.visible_to_alumni ?? true));
  }
  if (viewerBypassesEventAudienceFilter(viewer)) {
    return [...events];
  }
  return events.filter((e) => eventMatchesViewerAudience(e, viewer));
}

export function assertEventVisibleToViewer(
  event: EventAudienceFlags,
  viewer: EventAudienceViewer | null
): boolean {
  if (!viewer) {
    return (event.visible_to_active_members ?? true) && (event.visible_to_alumni ?? true);
  }
  if (viewerBypassesEventAudienceFilter(viewer)) return true;
  return eventMatchesViewerAudience(event, viewer);
}

export function parseAudienceBooleans(body: Record<string, unknown>): {
  visible_to_active_members: boolean;
  visible_to_alumni: boolean;
} {
  const rawActive = body.visible_to_active_members;
  const rawAlumni = body.visible_to_alumni;
  const visible_to_active_members =
    typeof rawActive === 'boolean' ? rawActive : rawActive === undefined ? true : Boolean(rawActive);
  const visible_to_alumni =
    typeof rawAlumni === 'boolean' ? rawAlumni : rawAlumni === undefined ? true : Boolean(rawAlumni);
  return { visible_to_active_members, visible_to_alumni };
}

export function validateAudienceSelection(visible_to_active_members: boolean, visible_to_alumni: boolean): {
  ok: boolean;
  error?: string;
} {
  if (!visible_to_active_members && !visible_to_alumni) {
    return { ok: false, error: 'Select at least one audience: Active Members and/or Alumni.' };
  }
  return { ok: true };
}
