import {
  GEOCODING_BACKFILL_TYPES_PRIORITIZE_PLACE,
  GEOCODING_SUGGEST_TYPES_DEFAULT_US,
  MAPBOX_GEOCODE_V6_FORWARD_URL,
} from '@/lib/mapbox/constants';
import { shouldRejectGeocodeSuggestionForLocationQuery } from '@/lib/mapbox/geocodeBackfillGuards';
import { dedupeGeocodingSuggestionsByFormattedDisplay } from '@/lib/mapbox/dedupeGeocodingSuggestionsByFormattedDisplay';
import type { GeocodingSuggestion } from '@/lib/mapbox/geocodeSuggestDto';
import { mapGeocodeV6FeaturesToSuggestions } from '@/lib/mapbox/geocodeSuggestDto';
import { mapGeocodeV6FeatureToCanonicalPlace } from '@/lib/mapbox/mapGeocodeV6FeatureToCanonicalPlace';
import { rankGeocodingSuggestionsByQuery } from '@/lib/mapbox/rankGeocodingSuggestionsByQuery';
import { parseCanonicalPlaceConfirmed, type CanonicalPlaceConfirmed } from '@/types/canonicalPlace';

function mapboxForward(params: URLSearchParams): Promise<Response> {
  const url = `${MAPBOX_GEOCODE_V6_FORWARD_URL}?${params.toString()}`;
  return fetch(url, { method: 'GET' });
}

function pickSuggestion(query: string, features: unknown[]): GeocodingSuggestion | null {
  const mapped = mapGeocodeV6FeaturesToSuggestions(features);
  const ranked = rankGeocodingSuggestionsByQuery(mapped, query);
  const deduped = dedupeGeocodingSuggestionsByFormattedDisplay(ranked, query);
  for (const s of deduped) {
    if (!shouldRejectGeocodeSuggestionForLocationQuery(query, s)) return s;
  }
  return null;
}

async function forwardSuggest(
  query: string,
  mapboxToken: string,
  types: string
): Promise<unknown[] | null> {
  const suggestParams = new URLSearchParams({
    q: query.trim(),
    access_token: mapboxToken,
    limit: '10',
    autocomplete: 'true',
    permanent: 'false',
    types,
    country: 'us',
    language: 'en',
  });

  const suggestRes = await mapboxForward(suggestParams);
  if (!suggestRes.ok) return null;
  try {
    const suggestJson = (await suggestRes.json()) as { features?: unknown[] };
    return Array.isArray(suggestJson.features) ? suggestJson.features : [];
  } catch {
    return null;
  }
}

/**
 * Forward-geocode free text (same flow as suggest → confirm): pick best ephemeral hit,
 * then re-resolve with `permanent=true` for Mapbox-compliant long-term storage.
 *
 * Uses a place-first forward pass, then full types, with guards against known bad rows.
 *
 * @see app/api/geocoding/suggest/route.ts
 * @see app/api/geocoding/confirm/route.ts
 */
export async function resolvePlaceFromLocationTextForStorage(
  locationText: string,
  mapboxToken: string,
  options?: { usePermanent?: boolean }
): Promise<CanonicalPlaceConfirmed | null> {
  const q = locationText.trim();
  if (q.length < 2) return null;

  const usePermanent = options?.usePermanent ?? process.env.MAPBOX_GEOCODING_PERMANENT !== 'false';

  let features =
    (await forwardSuggest(q, mapboxToken, GEOCODING_BACKFILL_TYPES_PRIORITIZE_PLACE)) ?? [];
  let top = pickSuggestion(q, features);
  if (!top) {
    features = (await forwardSuggest(q, mapboxToken, GEOCODING_SUGGEST_TYPES_DEFAULT_US)) ?? [];
    top = pickSuggestion(q, features);
  }
  if (!top?.mapbox_id) return null;

  const confirmParams = new URLSearchParams({
    q: top.mapbox_id,
    access_token: mapboxToken,
    limit: '1',
    autocomplete: 'false',
    permanent: usePermanent ? 'true' : 'false',
    country: 'us',
  });

  const confirmRes = await mapboxForward(confirmParams);
  if (!confirmRes.ok) return null;

  let confirmJson: { features?: unknown[] };
  try {
    confirmJson = (await confirmRes.json()) as { features?: unknown[] };
  } catch {
    return null;
  }

  const feature = confirmJson.features?.[0] as Parameters<typeof mapGeocodeV6FeatureToCanonicalPlace>[0] | undefined;
  if (!feature) return null;

  const partial = mapGeocodeV6FeatureToCanonicalPlace(feature, { worldview: null });
  const resolved_at = new Date().toISOString();
  const candidate: Record<string, unknown> = {
    provider: 'mapbox' as const,
    resolved_at,
    ...partial,
  };

  const validated = parseCanonicalPlaceConfirmed(candidate);
  if (!validated.success) return null;
  const place = validated.data;
  const pseudoSuggest: GeocodingSuggestion = {
    mapbox_id: place.mapbox_id ?? '',
    feature_type: place.feature_type,
    name: place.place_name ?? place.formatted_display ?? '',
    formatted_display: place.formatted_display ?? place.place_name ?? '',
    longitude: place.longitude ?? null,
    latitude: place.latitude ?? null,
  };
  if (shouldRejectGeocodeSuggestionForLocationQuery(q, pseudoSuggest)) return null;
  return place;
}
