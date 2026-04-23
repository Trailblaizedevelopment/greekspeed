import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserIdForGeocoding } from '@/lib/api/geocodingAuth';
import { consumeGeocodingSuggestRateLimit } from '@/lib/api/geocodingSuggestRateLimit';
import { fetchMapboxGeocodeV6Forward } from '@/lib/mapbox/fetchMapboxGeocodeV6Forward';
import { mapGeocodeV6FeaturesToSuggestions } from '@/lib/mapbox/geocodeSuggestDto';
import { logGeocodingRouteError } from '@/lib/mapbox/logGeocodingError';
import { rankGeocodingSuggestionsByQuery } from '@/lib/mapbox/rankGeocodingSuggestionsByQuery';
import { nextResponseForMapboxUpstreamFailure } from '@/lib/mapbox/mapboxGeocodingUpstreamResponse';
import {
  geocodingSuggestQuerySchema,
  geocodingSuggestTypesOrDefault,
  parseGeocodingSuggestLimit,
} from '@/lib/validation/geocoding';

/**
 * GET /api/geocoding/suggest
 *
 * Ephemeral autocomplete: Mapbox forward geocode with `permanent=false` (default).
 * Client should debounce and use `q` length ≥ 2 before calling.
 *
 * Query: `q` (required), optional `country` (defaults to **us**), `types`, `limit` (1–10), `worldview`, `proximity`, `language`.
 *
 * @see https://docs.mapbox.com/api/search/geocoding/#forward-geocoding-with-search-text-input
 * @see https://docs.mapbox.com/api/search/geocoding/#autocomplete-and-pricing
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const rawQuery = {
      q: searchParams.get('q') ?? '',
      country: searchParams.get('country') ?? undefined,
      types: searchParams.get('types') ?? undefined,
      worldview: searchParams.get('worldview') ?? undefined,
      proximity: searchParams.get('proximity') ?? undefined,
      language: searchParams.get('language') ?? undefined,
    };

    const parsed = geocodingSuggestQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { q, types, worldview, proximity, language } = parsed.data;
    /** US-only product: always scope suggest to United States (Mapbox `country=us`). */
    const countryCode = 'us';
    const responseLimit = parseGeocodingSuggestLimit(searchParams.get('limit'));
    /** Ask Mapbox for up to 10 features, then rank and slice — improves city hits for queries like "Tampa". */
    const mapboxFetchLimit = Math.min(10, Math.max(responseLimit, 10));
    const typesParam = geocodingSuggestTypesOrDefault(types);

    const rate = consumeGeocodingSuggestRateLimit(userId);
    if (!rate.ok) {
      return NextResponse.json(
        { error: 'Too many suggest requests; try again shortly' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
      );
    }

    const params = new URLSearchParams({
      q,
      access_token: mapboxToken,
      limit: String(mapboxFetchLimit),
      autocomplete: 'true',
      permanent: 'false',
      types: typesParam,
      country: countryCode,
    });
    if (worldview) params.set('worldview', worldview);
    if (proximity) params.set('proximity', proximity);
    params.set('language', language?.trim() || 'en');

    const mapboxRes = await fetchMapboxGeocodeV6Forward(params);

    if (!mapboxRes.ok) {
      console.warn('[geocoding:suggest] mapbox upstream', { status: mapboxRes.status });
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

    const features = Array.isArray(geojson.features) ? geojson.features : [];
    const mapped = mapGeocodeV6FeaturesToSuggestions(features);
    const ranked = rankGeocodingSuggestionsByQuery(mapped, q);
    const suggestions = ranked.slice(0, responseLimit);

    return NextResponse.json({
      data: {
        suggestions,
        limit: responseLimit,
      },
    });
  } catch (e) {
    logGeocodingRouteError('geocoding:suggest', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
