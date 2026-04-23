import { NextResponse } from 'next/server';

/**
 * Maps upstream Mapbox HTTP status to a client-safe JSON body (no token, no URL).
 * User-facing 401 is reserved for our own auth; Mapbox 401/403 become 502.
 */
export function nextResponseForMapboxUpstreamFailure(status: number): NextResponse | null {
  if (status === 401 || status === 403) {
    return NextResponse.json(
      { error: 'Geocoding provider rejected the request' },
      { status: 502 }
    );
  }
  if (status === 429) {
    return NextResponse.json(
      { error: 'Geocoding rate limit exceeded; try again shortly' },
      { status: 429 }
    );
  }
  if (status >= 400) {
    return NextResponse.json({ error: 'Geocoding request failed' }, { status: 502 });
  }
  return null;
}
