/** Mapbox Geocoding API v6 forward endpoint (search text input). */
export const MAPBOX_GEOCODE_V6_FORWARD_URL = 'https://api.mapbox.com/search/geocode/v6/forward';

/**
 * Default Geocoding `types` when the client omits `types`: broad, Mapbox-demo–like breadth.
 * Pair with `country=us` (defaults in suggest route + LocationPicker) for US-only results.
 * @see https://docs.mapbox.com/api/search/geocoding/#geographic-feature-types
 */
export const GEOCODING_SUGGEST_TYPES_DEFAULT_US =
  'place,locality,neighborhood,district,region,postcode,address,street';

/** Prefer city/region over streets when bulk-resolving `alumni.location` text. */
export const GEOCODING_BACKFILL_TYPES_PRIORITIZE_PLACE =
  'place,locality,region,postcode,neighborhood,district';
