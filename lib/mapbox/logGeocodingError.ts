import { redactAccessTokenInString } from '@/lib/mapbox/redactForLog';

/**
 * Logs a route error without leaking Mapbox `access_token` if it appears in
 * stack traces or messages.
 */
export function logGeocodingRouteError(routeTag: string, err: unknown): void {
  const raw =
    err instanceof Error ? (err.stack && err.stack.length > 0 ? err.stack : err.message) : String(err);
  console.error(`[${routeTag}]`, redactAccessTokenInString(raw));
}
