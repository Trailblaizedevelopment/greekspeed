import { z } from 'zod';

/** POST /api/geocoding/confirm — resolve a Mapbox feature id for server-side persistence. */
export const geocodingConfirmBodySchema = z
  .object({
    mapbox_id: z.string().trim().min(1, 'mapbox_id is required').max(512),
    worldview: z.string().trim().min(1).max(8).optional(),
  })
  .strict();

export type GeocodingConfirmBody = z.infer<typeof geocodingConfirmBodySchema>;
