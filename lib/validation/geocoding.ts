import { z } from 'zod';
import { GEOCODING_SUGGEST_TYPES_DEFAULT_US } from '@/lib/mapbox/constants';

export { GEOCODING_SUGGEST_TYPES_DEFAULT_US };

/** POST /api/geocoding/confirm — resolve a Mapbox feature id for server-side persistence. */
export const geocodingConfirmBodySchema = z
  .object({
    mapbox_id: z.string().trim().min(1, 'mapbox_id is required').max(512),
    country: z.string().max(64).optional(),
    worldview: z.string().trim().min(1).max(8).optional(),
  })
  .strict();

export type GeocodingConfirmBody = z.infer<typeof geocodingConfirmBodySchema>;

/** GET /api/geocoding/suggest — query string validated before calling Mapbox forward geocode. */
export const geocodingSuggestQuerySchema = z
  .object({
    q: z.string().trim().min(2, 'Use at least 2 characters').max(256),
    country: z.string().max(64).optional(),
    types: z.string().max(196).optional(),
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
  return t && t.length > 0 ? t : GEOCODING_SUGGEST_TYPES_DEFAULT_US;
}
