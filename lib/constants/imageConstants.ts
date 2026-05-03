/**
 * Image dimension constraints for avatars and banners
 */

export const AVATAR_CONSTRAINTS = {
  // Display constraints
  DISPLAY_SIZE: 160, // Typical avatar display size (80px * 2 for retina)
  
  // Crop constraints
  ASPECT_RATIO: 1, // Square (1:1)
  RECOMMENDED_SIZE: 400, // Recommended crop size (400x400px)
  
  // File constraints
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  
  // Crop area constraints (for react-easy-crop)
  CROP_AREA_MIN_SIZE: 100,
};

/** Square hero for donation campaigns (Stripe + UI); same output shape as avatar crop, rectangular mask in UI. */
export const DONATION_HERO_CONSTRAINTS = {
  ASPECT_RATIO: 1,
  RECOMMENDED_SIZE: 400,
  MAX_SIZE: 5 * 1024 * 1024,
  CROP_AREA_MIN_SIZE: 100,
} as const;

export const BANNER_CONSTRAINTS = {
  // Display constraints
  DISPLAY_HEIGHT: 256, // h-64 = 16rem = 256px
  DISPLAY_WIDTH: 1200, // Typical banner width
  
  // Crop constraints
  ASPECT_RATIO: 1200 / 256, // ~4.69:1 (wide banner)
  RECOMMENDED_HEIGHT: 400,
  RECOMMENDED_WIDTH: 1920, // Full HD width
  MIN_ASPECT_RATIO: 3.0, // Minimum width:height ratio
  MAX_ASPECT_RATIO: 5.0, // Maximum width:height ratio
  
  // File constraints
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  
  // Crop area constraints (for react-easy-crop)
  CROP_AREA_MIN_WIDTH: 600,
  CROP_AREA_MIN_HEIGHT: 150,
};
