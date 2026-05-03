/** Supabase Storage bucket for cropped donation hero images (public URLs for Stripe Product.images). */
export const DONATION_HERO_IMAGE_BUCKET = 'donation-campaign-hero-images';

export const DONATION_HERO_UPLOAD_ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const DONATION_HERO_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
