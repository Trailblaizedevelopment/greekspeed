/**
 * Branch / mobile-app fallback routing: resolve safe "Continue on web" targets from query params.
 * Used by `app/(marketing)/open` — keep in sync with Branch dashboard custom data keys.
 *
 * Supported query shape (all optional except where noted):
 * - `intent=invite` + `token` → `/join/{token}`
 * - `intent=chapter_join` + `slug` → `/join/chapter/{slug}`
 * - `intent=alumni_invite` + `token` → `/alumni-join/{token}`
 * - `intent=web` + `path` → allowlisted pathname; optional `search` (validated keys only)
 *
 * Use `buildOpenBridgeWebIntentQueryParams()` from this file (with `openBridgeUrls.ts`) to build
 * validated `/open?intent=web&…` links for emails and shareable URLs.
 */

const INVITE_TOKEN_RE = /^[A-Za-z0-9]{16,64}$/;
const CHAPTER_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/i;

const ALLOWED_SEARCH_KEYS = new Set([
  'connection',
  'request',
  'event',
  't',
  'view',
  'chapter',
]);

const SAFE_SEARCH_VALUE_RE = /^[A-Za-z0-9._-]{1,200}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OpenBridgeResolution {
  /** Path + query only (starts with `/`). Safe for same-origin navigation. */
  continuePath: string;
  /** Short label for UI when we inferred from structured intent. */
  intentLabel: string | null;
}

function isSafeSearchValue(key: string, value: string): boolean {
  if (value.length > 200 || value.length === 0) return false;
  if (key === 'connection' || key === 'request' || key === 'event') {
    return UUID_RE.test(value) || SAFE_SEARCH_VALUE_RE.test(value);
  }
  return SAFE_SEARCH_VALUE_RE.test(value);
}

function validateAndAppendSearch(
  pathname: string,
  searchRaw: string | undefined
): string | null {
  if (!searchRaw || searchRaw.length === 0) return pathname;
  if (searchRaw.length > 500 || !searchRaw.startsWith('?')) return null;

  const params = new URLSearchParams(searchRaw.slice(1));
  for (const key of params.keys()) {
    if (!ALLOWED_SEARCH_KEYS.has(key)) return null;
  }
  for (const [key, value] of params.entries()) {
    if (!isSafeSearchValue(key, value)) return null;
  }
  return `${pathname}${searchRaw}`;
}

/**
 * Returns true if `pathname` is a non-empty relative path allowed for generic web intent.
 */
export function isAllowlistedWebIntentPath(pathname: string): boolean {
  if (!pathname.startsWith('/') || pathname.length > 512) return false;
  if (pathname.includes('//') || pathname.includes('\\')) return false;
  if (pathname.includes(':')) return false;
  /** Prevent `intent=web` → `/open` loops. */
  if (pathname === '/open' || pathname.startsWith('/open/')) return false;

  if (pathname.startsWith('/join/chapter/')) return true;
  if (pathname.startsWith('/join/')) return true;
  if (pathname.startsWith('/event/')) return true;
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return true;
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding/')) return true;
  if (pathname === '/sign-in' || pathname.startsWith('/sign-in/')) return true;
  if (pathname === '/sign-up' || pathname.startsWith('/sign-up/')) return true;
  if (pathname.startsWith('/alumni-join/')) return true;
  if (pathname === '/profile' || pathname.startsWith('/profile/')) return true;
  return false;
}

function normalizePathParam(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return null;
  }
  if (decoded.includes('?')) return null;
  if (!decoded.startsWith('/')) return null;
  if (!isAllowlistedWebIntentPath(decoded)) return null;
  return decoded;
}

function firstString(
  value: string | string[] | undefined
): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Returns the chapter-invite token when `intent=invite` and the token format is valid.
 * Used server-side for safe preview (e.g. chapter name on `/open`) without exposing invalid tokens.
 */
export function getOpenBridgeChapterInviteToken(
  raw: Record<string, string | string[] | undefined>
): string | null {
  const intent = firstString(raw.intent)?.toLowerCase().trim();
  const token = firstString(raw.token)?.trim();
  if (intent !== 'invite' || !token || !INVITE_TOKEN_RE.test(token)) return null;
  return token;
}

/**
 * Resolves Branch / app-open landing query params to a same-origin continue path.
 * Falls back to `/` when nothing valid is provided.
 */
export function resolveOpenBridgeContinuePath(
  raw: Record<string, string | string[] | undefined>
): OpenBridgeResolution {
  const intent = firstString(raw.intent)?.toLowerCase().trim();
  const token = firstString(raw.token)?.trim();
  const slug = firstString(raw.slug)?.trim();
  const path = firstString(raw.path);
  const search = firstString(raw.search);

  if (intent === 'invite' && token && INVITE_TOKEN_RE.test(token)) {
    return {
      continuePath: `/join/${encodeURIComponent(token)}`,
      intentLabel: 'Chapter invitation',
    };
  }

  if (intent === 'alumni_invite' && token && INVITE_TOKEN_RE.test(token)) {
    return {
      continuePath: `/alumni-join/${encodeURIComponent(token)}`,
      intentLabel: 'Alumni invitation',
    };
  }

  if (intent === 'chapter_join' && slug && CHAPTER_SLUG_RE.test(slug)) {
    return {
      continuePath: `/join/chapter/${encodeURIComponent(slug)}`,
      intentLabel: 'Chapter join link',
    };
  }

  if (intent === 'web' && path) {
    const pathname = normalizePathParam(path);
    if (!pathname) {
      return { continuePath: '/', intentLabel: null };
    }
    const searchNorm =
      search && search.length > 0
        ? search.startsWith('?')
          ? search
          : `?${search}`
        : undefined;
    const withSearch = searchNorm
      ? validateAndAppendSearch(pathname, searchNorm)
      : pathname;
    if (!withSearch) {
      return { continuePath: '/', intentLabel: null };
    }
    return { continuePath: withSearch, intentLabel: 'Saved link' };
  }

  return { continuePath: '/', intentLabel: null };
}

export interface OpenBridgeStoreUrls {
  ios: string | null;
  android: string | null;
}

export function getOpenBridgeStoreUrls(): OpenBridgeStoreUrls {
  const ios = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() || null;
  const android = process.env.NEXT_PUBLIC_GOOGLE_PLAY_URL?.trim() || null;
  return { ios, android };
}

/**
 * Builds validated query params for `/open?intent=web&path=…&search=…`.
 * Returns null if pathname is not allowlisted or search fails validation.
 */
export function buildOpenBridgeWebIntentQueryParams(
  pathname: string,
  search?: string
): URLSearchParams | null {
  if (!isAllowlistedWebIntentPath(pathname)) return null;
  const params = new URLSearchParams();
  params.set('intent', 'web');
  params.set('path', pathname);
  if (search && search.length > 0) {
    const searchNorm = search.startsWith('?') ? search : `?${search}`;
    const withSearch = validateAndAppendSearch(pathname, searchNorm);
    if (!withSearch) return null;
    params.set('search', searchNorm);
  }
  return params;
}
