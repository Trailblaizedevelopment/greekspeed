import type { NextResponse } from 'next/server';
import { getSafeRedirect } from '@/lib/utils/safeRedirect';

/** Set from the sign-in page before OAuth; read in `/auth/callback` if `redirect_to` is missing. */
export const OAUTH_POST_LOGIN_REDIRECT_COOKIE = 'oauth_post_login_redirect';
export const OAUTH_POST_LOGIN_REDIRECT_MAX_AGE_SEC = 600;

/** Public sign-up page sets `alumni` so `/auth/callback` stays a bare URL for PKCE `?code=`. */
export const OAUTH_SIGNUP_ROLE_COOKIE = 'oauth_signup_role';

/**
 * Prefer `redirect_to` on the callback URL (Supabase); fall back to the short-lived cookie
 * set before `signInWithOAuth` so the return path survives provider redirects.
 */
export function resolvePostOAuthSafeRedirect(
  redirectToFromUrl: string | null | undefined,
  cookieRawValue: string | undefined | null
): string | null {
  const fromQuery = getSafeRedirect(redirectToFromUrl ?? null);
  if (fromQuery) return fromQuery;
  if (cookieRawValue == null || cookieRawValue === '') return null;
  let decoded = cookieRawValue.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // use trimmed raw value
  }
  return getSafeRedirect(decoded);
}

export function clearOauthPostLoginRedirectCookieOn(res: NextResponse): void {
  res.cookies.set(OAUTH_POST_LOGIN_REDIRECT_COOKIE, '', {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export function clearOauthSignupRoleCookieOn(res: NextResponse): void {
  res.cookies.set(OAUTH_SIGNUP_ROLE_COOKIE, '', {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Clears public-sign-up alumni marker before chapter-join OAuth so callback fallback cannot mis-classify the user. */
export function clearOauthSignupRoleCookieInBrowser(): void {
  if (typeof window === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${OAUTH_SIGNUP_ROLE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
