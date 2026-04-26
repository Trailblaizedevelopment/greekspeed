/**
 * Canonical `/open` entry URLs for invites, chapter join, and web intents.
 * Keep query keys aligned with `lib/utils/deferredAppRouting.ts`.
 */

import { buildOpenBridgeWebIntentQueryParams } from '@/lib/utils/deferredAppRouting';
import { getBaseUrl, getEmailBaseUrl } from '@/lib/utils/urlUtils';

const INVITE_TOKEN_RE = /^[A-Za-z0-9]{16,64}$/;
const CHAPTER_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/i;

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

/**
 * Public invite / alumni-invite link: lands on `/open` then continues to join.
 */
export function buildOpenBridgeInviteEntryUrl(
  token: string,
  invitationType?: string,
  baseUrl?: string
): string {
  const base = normalizeBase(baseUrl || getBaseUrl());
  if (!INVITE_TOKEN_RE.test(token)) {
    return invitationType === 'alumni'
      ? `${base}/alumni-join/${encodeURIComponent(token)}`
      : `${base}/join/${encodeURIComponent(token)}`;
  }
  const params = new URLSearchParams();
  params.set('intent', invitationType === 'alumni' ? 'alumni_invite' : 'invite');
  params.set('token', token);
  return `${base}/open?${params.toString()}`;
}

/**
 * Public chapter slug join link: lands on `/open` then continues to `/join/chapter/…`.
 */
export function buildOpenBridgeChapterJoinEntryUrl(
  slug: string,
  baseUrl?: string
): string {
  const base = normalizeBase(baseUrl || getBaseUrl());
  const trimmed = slug.trim();
  if (!CHAPTER_SLUG_RE.test(trimmed)) {
    return `${base}/join/chapter/${encodeURIComponent(trimmed)}`;
  }
  const params = new URLSearchParams();
  params.set('intent', 'chapter_join');
  params.set('slug', trimmed);
  return `${base}/open?${params.toString()}`;
}

/**
 * Full absolute URL for `intent=web` bridge entry (e.g. event emails). Returns null if path is not allowlisted.
 */
export function buildOpenBridgeWebIntentEntryUrl(
  pathname: string,
  baseUrl?: string,
  search?: string
): string | null {
  const q = buildOpenBridgeWebIntentQueryParams(pathname, search);
  if (!q) return null;
  const base = normalizeBase(baseUrl || getEmailBaseUrl());
  return `${base}/open?${q.toString()}`;
}

/**
 * Same-origin path + query for Supabase `redirectTo` (e.g. `/open?intent=web&path=…`).
 */
export function buildOpenBridgeWebIntentRelativeLink(
  pathname: string,
  search?: string
): string | null {
  const q = buildOpenBridgeWebIntentQueryParams(pathname, search);
  if (!q) return null;
  return `/open?${q.toString()}`;
}
