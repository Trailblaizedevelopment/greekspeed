import { z } from 'zod';

/**
 * Mapbox Geocoding v6 `feature_type` values (plus related types).
 * @see https://docs.mapbox.com/api/search/geocoding/#geographic-feature-types
 */
export const MAPBOX_GEOCODE_FEATURE_TYPES = [
  'country',
  'region',
  'postcode',
  'district',
  'place',
  'locality',
  'neighborhood',
  'street',
  'address',
  'block',
  'secondary_address',
] as const;

export type MapboxGeocodeFeatureType = (typeof MAPBOX_GEOCODE_FEATURE_TYPES)[number];

/** Canonical persisted place (ADR 001) — JSON in `profiles.current_place` / `hometown_place`, `alumni.current_place`. */
export const canonicalPlaceSchema = z
  .object({
    provider: z.literal('mapbox').optional(),
    mapbox_id: z.string().min(1).optional(),
    feature_type: z.enum(MAPBOX_GEOCODE_FEATURE_TYPES).optional(),
    country_code: z
      .string()
      .length(2)
      .regex(/^[A-Za-z]{2}$/, 'ISO 3166-1 alpha-2')
      .nullable()
      .optional(),
    region_code: z.string().min(1).max(16).nullable().optional(),
    region_code_full: z.string().min(1).max(16).nullable().optional(),
    place_name: z.string().min(1).max(256).nullable().optional(),
    locality_name: z.string().min(1).max(256).nullable().optional(),
    district_name: z.string().min(1).max(256).nullable().optional(),
    postcode: z.string().min(1).max(32).nullable().optional(),
    longitude: z.number().gte(-180).lte(180).nullable().optional(),
    latitude: z.number().gte(-90).lte(90).nullable().optional(),
    formatted_display: z.string().min(1).max(512).nullable().optional(),
    worldview: z.string().min(1).max(8).nullable().optional(),
    resolved_at: z.string().min(1).max(64).optional(),
  })
  .strict();

export type CanonicalPlace = z.infer<typeof canonicalPlaceSchema>;

/**
 * User-confirmed selection from Mapbox (persist with `permanent=true` when storing long-term).
 */
export const canonicalPlaceConfirmedSchema = canonicalPlaceSchema.refine(
  (data) => Boolean(data.mapbox_id?.trim() && data.resolved_at?.trim()),
  { message: 'Confirmed place requires mapbox_id and resolved_at' }
);

export type CanonicalPlaceConfirmed = z.infer<typeof canonicalPlaceConfirmedSchema>;

export function parseCanonicalPlace(value: unknown): {
  success: true;
  data: CanonicalPlace;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = canonicalPlaceSchema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function parseCanonicalPlaceConfirmed(value: unknown): {
  success: true;
  data: CanonicalPlaceConfirmed;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = canonicalPlaceConfirmedSchema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/** Display label: prefer Mapbox formatted string, else best-effort from parts. */
export function formatCanonicalPlaceDisplay(place: CanonicalPlace | null | undefined): string {
  if (!place) return '';
  const fd = place.formatted_display?.trim();
  if (fd) return fd;
  const parts = [place.place_name, place.region_code ?? place.region_code_full, place.country_code].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0
  );
  return parts.join(', ');
}

/**
 * Removes trailing US country segments from a single-line place label (Mapbox-style).
 * Safe suffix-only: repeated passes for odd double-suffix strings.
 */
export function stripTrailingUsCountryFromDisplay(line: string): string {
  let s = line.trim();
  if (!s) return '';
  const suffix =
    /, (United States of America|United States|USA|U\.S\.A\.|U\.S\.|US)$/i;
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(suffix, '').trimEnd();
  }
  return s;
}

/**
 * User-visible place line for the US-only app: full Mapbox-style label minus trailing country.
 * @see formatCanonicalPlaceDisplay — use that when you need the exact Mapbox string (rare).
 */
export function formatCanonicalPlaceDisplayForApp(place: CanonicalPlace | null | undefined): string {
  return stripTrailingUsCountryFromDisplay(formatCanonicalPlaceDisplay(place));
}

/** Plain stored `profiles.location` / `profiles.hometown` / legacy rows — strip trailing US for UI only. */
export function formatLocationLineForApp(line: string | null | undefined): string {
  if (line == null) return '';
  return stripTrailingUsCountryFromDisplay(String(line));
}
