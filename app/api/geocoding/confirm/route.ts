import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserIdForGeocoding } from '@/lib/api/geocodingAuth';
import { fetchMapboxGeocodeV6Forward } from '@/lib/mapbox/fetchMapboxGeocodeV6Forward';
import { logGeocodingRouteError } from '@/lib/mapbox/logGeocodingError';
import { nextResponseForMapboxUpstreamFailure } from '@/lib/mapbox/mapboxGeocodingUpstreamResponse';
import { mapGeocodeV6FeatureToCanonicalPlace } from '@/lib/mapbox/mapGeocodeV6FeatureToCanonicalPlace';
import { geocodingConfirmBodySchema } from '@/lib/validation/geocoding';
import { parseCanonicalPlaceConfirmed, type CanonicalPlaceConfirmed } from '@/types/canonicalPlace';

/**
 * POST /api/geocoding/confirm
 *
 * Re-resolves a Mapbox `mapbox_id` with `permanent=true` (when enabled) and returns a
 * validated {@link CanonicalPlaceConfirmed} for persisting to `profiles` / `alumni`.
 *
 * Auth: Bearer token or Supabase session cookie (same-origin).
 *
 * @see https://docs.mapbox.com/api/search/geocoding/#forward-geocoding-with-search-text-input
 * @see https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const mapboxToken = process.env.MAPBOX_SECRET_ACCESS_TOKEN;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    if (!mapboxToken) {
      return NextResponse.json(
        { error: 'Geocoding is not configured (missing MAPBOX_SECRET_ACCESS_TOKEN)' },
        { status: 503 }
      );
    }

    const userId = await getAuthenticatedUserIdForGeocoding(
      request,
      supabaseUrl,
      supabaseAnonKey,
      serviceRoleKey
    );
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsedBody = geocodingConfirmBodySchema.safeParse(json);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { mapbox_id, worldview } = parsedBody.data;
    const usePermanent = process.env.MAPBOX_GEOCODING_PERMANENT !== 'false';

    /** US-only: ignore client `country` for Mapbox confirm scoping. */
    const countryCode = 'us';
    const params = new URLSearchParams({
      q: mapbox_id,
      access_token: mapboxToken,
      limit: '1',
      autocomplete: 'false',
      permanent: usePermanent ? 'true' : 'false',
      country: countryCode,
    });
    if (worldview) {
      params.set('worldview', worldview);
    }

    const mapboxRes = await fetchMapboxGeocodeV6Forward(params);

    if (!mapboxRes.ok) {
      console.warn('[geocoding:confirm] mapbox upstream', { status: mapboxRes.status });
      const mapped = nextResponseForMapboxUpstreamFailure(mapboxRes.status);
      if (mapped) return mapped;
      return NextResponse.json({ error: 'Geocoding request failed' }, { status: 502 });
    }

    let geojson: { features?: unknown[] };
    try {
      geojson = (await mapboxRes.json()) as { features?: unknown[] };
    } catch {
      return NextResponse.json({ error: 'Invalid geocoding response' }, { status: 502 });
    }

    const feature = geojson.features?.[0] as Parameters<typeof mapGeocodeV6FeatureToCanonicalPlace>[0] | undefined;
    if (!feature) {
      return NextResponse.json({ error: 'No result found for the given mapbox_id' }, { status: 404 });
    }

    const partial = mapGeocodeV6FeatureToCanonicalPlace(feature, { worldview: worldview ?? null });
    const resolved_at = new Date().toISOString();
    const candidate: Record<string, unknown> = {
      provider: 'mapbox' as const,
      resolved_at,
      ...partial,
    };

    const validated = parseCanonicalPlaceConfirmed(candidate);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Could not normalize geocoding result', details: validated.error.flatten() },
        { status: 502 }
      );
    }

    const place: CanonicalPlaceConfirmed = validated.data;

    return NextResponse.json({
      data: {
        place,
        permanent: usePermanent,
      },
    });
  } catch (e) {
    logGeocodingRouteError('geocoding:confirm', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
