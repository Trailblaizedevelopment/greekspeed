import { z } from 'zod';

/** Aligned with `AnnouncementImageService` / MMS-friendly cap */
export const ANNOUNCEMENT_IMAGE_MAX_BYTES = 1 * 1024 * 1024;

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;

function buildImageEntrySchema(expectedHost: string) {
  return z
    .object({
      url: z.string().url(),
      mimeType: z.enum(ALLOWED_MIME_TYPES),
      sizeBytes: z.number().int().positive().max(ANNOUNCEMENT_IMAGE_MAX_BYTES),
      alt: z.string().trim().max(500).optional(),
    })
    .superRefine((data, ctx) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(data.url);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid image URL',
          path: ['url'],
        });
        return;
      }
      if (parsedUrl.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Image URL must use HTTPS',
          path: ['url'],
        });
      }
      if (parsedUrl.hostname !== expectedHost) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Image URL must be served from this Supabase project',
          path: ['url'],
        });
      }
      if (!parsedUrl.pathname.includes('/announcement-images/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Image URL must be under the announcement-images bucket',
          path: ['url'],
        });
      }
    });
}

export type SanitizedAnnouncementMetadata = Record<string, unknown>;

export type SanitizeAnnouncementMetadataResult =
  | { ok: true; metadata: SanitizedAnnouncementMetadata }
  | { ok: false; error: string; details?: z.ZodIssue[] };

/**
 * On create, only validated `images` are taken from client metadata (max one).
 * Other keys are ignored so arbitrary client metadata cannot be injected.
 */
export function sanitizeAnnouncementMetadataForCreate(
  metadata: unknown,
  supabaseUrl: string
): SanitizeAnnouncementMetadataResult {
  if (metadata === undefined || metadata === null) {
    return { ok: true, metadata: {} };
  }
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { ok: false, error: 'metadata must be a plain object' };
  }

  const raw = metadata as Record<string, unknown>;
  const rawImages = raw.images;

  if (rawImages === undefined || rawImages === null) {
    return { ok: true, metadata: {} };
  }

  if (!Array.isArray(rawImages)) {
    return { ok: false, error: 'metadata.images must be an array' };
  }

  if (rawImages.length === 0) {
    return { ok: true, metadata: {} };
  }

  let expectedHost: string;
  try {
    expectedHost = new URL(supabaseUrl).hostname;
  } catch {
    return { ok: false, error: 'Invalid server configuration for image URL validation' };
  }

  const imageEntrySchema = buildImageEntrySchema(expectedHost);
  const imagesSchema = z.array(imageEntrySchema).max(1);
  const parsed = imagesSchema.safeParse(rawImages);

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid announcement image metadata',
      details: parsed.error.issues,
    };
  }

  const images = parsed.data.map((entry) => ({
    url: entry.url,
    mimeType: entry.mimeType,
    sizeBytes: entry.sizeBytes,
    ...(entry.alt !== undefined && entry.alt.length > 0 ? { alt: entry.alt } : {}),
  }));

  return { ok: true, metadata: { images } };
}

/** Read first image from persisted announcement metadata (post-insert / notifications). */
export function getFirstAnnouncementImageFromMetadata(
  metadata: unknown
): { url: string; alt?: string } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const raw = metadata as { images?: Array<{ url?: string; alt?: string }> };
  const first = raw.images?.[0];
  if (!first?.url || typeof first.url !== 'string') {
    return null;
  }
  const alt = first.alt;
  return {
    url: first.url,
    ...(typeof alt === 'string' && alt.trim().length > 0 ? { alt: alt.trim() } : {}),
  };
}
