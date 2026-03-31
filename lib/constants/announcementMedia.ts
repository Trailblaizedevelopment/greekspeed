/**
 * Single source of truth for announcement attachment image size (client upload, API Zod, storage).
 * Keep in sync with Supabase Storage bucket max file size (dashboard) if you cap uploads there.
 */
export const ANNOUNCEMENT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
