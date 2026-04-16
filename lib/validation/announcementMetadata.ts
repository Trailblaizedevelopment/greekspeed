import { z } from 'zod';

import { ANNOUNCEMENT_IMAGE_MAX_BYTES } from '@/lib/constants/announcementMedia';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;

/** Max length for persisted primary link URL string (after trim). */
export const ANNOUNCEMENT_PRIMARY_LINK_URL_MAX = 2048;

/** Max length for optional CTA / display label. */
export const ANNOUNCEMENT_PRIMARY_LINK_LABEL_MAX = 80;

export interface AnnouncementPrimaryLink {
  url: string;
  label?: string;
}

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

function buildPrimaryLinkSchema() {
  return z
    .object({
      url: z.string().max(ANNOUNCEMENT_PRIMARY_LINK_URL_MAX),
      label: z.string().max(ANNOUNCEMENT_PRIMARY_LINK_LABEL_MAX).optional(),
    })
    .superRefine((data, ctx) => {
      const trimmedUrl = data.url.trim();
      if (!trimmedUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Primary link URL cannot be empty',
          path: ['url'],
        });
        return;
      }
      if (trimmedUrl.length > ANNOUNCEMENT_PRIMARY_LINK_URL_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Primary link URL must be at most ${ANNOUNCEMENT_PRIMARY_LINK_URL_MAX} characters`,
          path: ['url'],
        });
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(trimmedUrl);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid primary link URL',
          path: ['url'],
        });
        return;
      }
      if (parsed.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Primary link must use HTTPS',
          path: ['url'],
        });
        return;
      }
      if (!parsed.hostname) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid primary link URL',
          path: ['url'],
        });
      }
      const labelTrimmed = data.label?.trim();
      if (data.label !== undefined && labelTrimmed !== undefined && data.label.length > 0 && !labelTrimmed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Primary link label cannot be only whitespace',
          path: ['label'],
        });
      }
    });
}

export type SanitizedAnnouncementMetadata = Record<string, unknown>;

export type SanitizeAnnouncementMetadataResult =
  | { ok: true; metadata: SanitizedAnnouncementMetadata }
  | { ok: false; error: string; details?: z.ZodIssue[] };

/**
 * On create, only validated `images` (max one) and optional `primary_link` are taken
 * from client metadata. Other keys are ignored so arbitrary client metadata cannot be injected.
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
  const out: SanitizedAnnouncementMetadata = {};

  // --- images (optional, max one) ---
  const rawImages = raw.images;
  if (rawImages !== undefined && rawImages !== null) {
    if (!Array.isArray(rawImages)) {
      return { ok: false, error: 'metadata.images must be an array' };
    }
    if (rawImages.length > 0) {
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

      out.images = parsed.data.map((entry) => ({
        url: entry.url,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        ...(entry.alt !== undefined && entry.alt.length > 0 ? { alt: entry.alt } : {}),
      }));
    }
  }

  // --- primary_link (optional, one HTTPS URL + optional label) ---
  const rawPrimaryLink = raw.primary_link;
  if (rawPrimaryLink !== undefined && rawPrimaryLink !== null) {
    if (typeof rawPrimaryLink !== 'object' || Array.isArray(rawPrimaryLink)) {
      return { ok: false, error: 'metadata.primary_link must be a plain object' };
    }
    const pl = rawPrimaryLink as Record<string, unknown>;
    if (typeof pl.url !== 'string') {
      return { ok: false, error: 'metadata.primary_link.url must be a string' };
    }
    if (pl.label !== undefined && pl.label !== null && typeof pl.label !== 'string') {
      return { ok: false, error: 'metadata.primary_link.label must be a string when provided' };
    }

    const primarySchema = buildPrimaryLinkSchema();
    const parsedLink = primarySchema.safeParse({
      url: pl.url,
      label: pl.label === undefined || pl.label === null ? undefined : pl.label,
    });

    if (!parsedLink.success) {
      return {
        ok: false,
        error: 'Invalid announcement primary link metadata',
        details: parsedLink.error.issues,
      };
    }

    const trimmedUrl = parsedLink.data.url.trim();
    const labelTrimmed = parsedLink.data.label?.trim();
    out.primary_link = {
      url: trimmedUrl,
      ...(labelTrimmed && labelTrimmed.length > 0 ? { label: labelTrimmed } : {}),
    };
  }

  return { ok: true, metadata: out };
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

/** Read optional primary link from persisted announcement metadata. */
export function getPrimaryLinkFromMetadata(metadata: unknown): AnnouncementPrimaryLink | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const raw = metadata as { primary_link?: { url?: unknown; label?: unknown } };
  const link = raw.primary_link;
  if (!link || typeof link !== 'object' || Array.isArray(link)) {
    return null;
  }
  if (typeof link.url !== 'string' || !link.url.trim()) {
    return null;
  }
  try {
    const u = new URL(link.url.trim());
    if (u.protocol !== 'https:') {
      return null;
    }
  } catch {
    return null;
  }
  const label = link.label;
  if (typeof label === 'string' && label.trim().length > 0) {
    return { url: link.url.trim(), label: label.trim() };
  }
  return { url: link.url.trim() };
}
