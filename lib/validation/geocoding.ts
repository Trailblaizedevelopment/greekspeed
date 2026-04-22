import { z } from 'zod';

/** POST /api/geocoding/confirm — resolve a Mapbox feature id for server-side persistence. */
export const geocodingConfirmBodySchema = z
  .object({
    mapbox_id: z.string().trim().min(1, 'mapbox_id is required').max(512),
    worldview: z.string().trim().min(1).max(8).optional(),
  })
  .strict();

export type GeocodingConfirmBody = z.infer<typeof geocodingConfirmBodySchema>;

const DEFAULT_SUGGEST_TYPES = 'place,locality,region,postcode';

/** GET /api/geocoding/suggest — query string validated before calling Mapbox forward geocode. */
export const geocodingSuggestQuerySchema = z
  .object({
    q: z.string().trim().min(2, 'Use at least 2 characters').max(256),
    country: z.string().max(64).optional(),
    types: z.string().max(128).optional(),
    worldview: z.string().max(8).optional(),
    proximity: z.string().max(80).optional(),
    language: z.string().max(35).optional(),
  })
  .strict();

export type GeocodingSuggestQuery = z.infer<typeof geocodingSuggestQuerySchema>;

export function parseGeocodingSuggestLimit(raw: string | null): number {
  if (raw == null || raw === '') return 5;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return 5;
  return Math.min(10, Math.max(1, n));
}

export function geocodingSuggestTypesOrDefault(types: string | undefined): string {
  const t = types?.trim();
  return t && t.length > 0 ? t : DEFAULT_SUGGEST_TYPES;
}
