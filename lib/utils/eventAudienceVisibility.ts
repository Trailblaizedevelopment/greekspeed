import type { ChapterRole } from '@/types/profile';
import { EXECUTIVE_ROLES } from '@/lib/permissions';

/** Profile fields used to decide list/detail visibility for chapter events. */
export type EventAudienceViewer = {
  role: string | null;
  chapter_role: string | null;
  /** `profiles.chapter_id` — used to scope chapter exec / system admin bypass. */
  profile_chapter_id?: string | null;
  is_developer?: boolean | null;
  /** When present, governance bypass only for these chapters. */
  governance_managed_chapter_ids?: string[] | null;
  /**
   * When set, drives active vs alumni audience matching for this chapter
   * (from `space_memberships.status` or legacy home profile).
   */
  audience_segment?: 'alumni' | 'active_member' | null;
};

export type EventAudienceFlags = {
  visible_to_active_members?: boolean | null;
  visible_to_alumni?: boolean | null;
};

/**
 * Exec / governance / developer may see all audience segments for events in chapters they manage.
 * @param eventChapterId — `events.chapter_id` for the rows being filtered.
 */
export function viewerBypassesEventAudienceFilter(
  viewer: EventAudienceViewer,
  eventChapterId: string
): boolean {
  if (viewer.is_developer) return true;

  if (viewer.role === 'governance') {
    const managed = viewer.governance_managed_chapter_ids;
    if (managed != null && managed.length > 0) {
      return managed.includes(eventChapterId);
    }
    return true;
  }

  const homeId = viewer.profile_chapter_id ?? null;
  if (viewer.role === 'admin' && homeId === eventChapterId) return true;

  if (
    viewer.role === 'active_member' &&
    viewer.chapter_role &&
    homeId === eventChapterId &&
    EXECUTIVE_ROLES.includes(viewer.chapter_role as ChapterRole)
  ) {
    return true;
  }
  return false;
}

/**
 * Whether a chapter event should appear for this viewer (ignoring exec/developer bypass).
 */
export function eventMatchesViewerAudience(
  event: EventAudienceFlags,
  viewer: EventAudienceViewer
): boolean {
  const showActive = event.visible_to_active_members ?? true;
  const showAlumni = event.visible_to_alumni ?? true;

  const segment =
    viewer.audience_segment ??
    (viewer.role === 'alumni' ? 'alumni' : viewer.role === 'active_member' ? 'active_member' : null);

  if (segment === 'alumni') {
    return showAlumni;
  }
  if (segment === 'active_member') {
    return showActive;
  }
  return false;
}

/**
 * Filter event rows for list responses.
 * @param eventChapterId — chapter scope of these events (same as query `chapter_id`).
 * @param viewer null = unauthenticated (e.g. public profile sidebar): only events visible to both segments.
 */
export function filterEventsForAudience<T extends EventAudienceFlags>(
  events: T[] | null | undefined,
  viewer: EventAudienceViewer | null,
  eventChapterId: string
): T[] {
  if (!events?.length) return [];
  if (!viewer) {
    return events.filter((e) => (e.visible_to_active_members ?? true) && (e.visible_to_alumni ?? true));
  }
  if (viewerBypassesEventAudienceFilter(viewer, eventChapterId)) {
    return [...events];
  }
  return events.filter((e) => eventMatchesViewerAudience(e, viewer));
}

export function assertEventVisibleToViewer(
  event: EventAudienceFlags,
  viewer: EventAudienceViewer | null,
  eventChapterId: string
): boolean {
  if (!viewer) {
    return (event.visible_to_active_members ?? true) && (event.visible_to_alumni ?? true);
  }
  if (viewerBypassesEventAudienceFilter(viewer, eventChapterId)) return true;
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
