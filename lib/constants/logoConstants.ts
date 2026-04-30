/**
 * Logo dimension constraints based on header requirements
 * Headers use h-28 (112px) with w-auto and object-contain
 */
export const LOGO_CONSTRAINTS = {
  // Display constraints (from headers)
  DISPLAY_HEIGHT: 112, // h-28 = 7rem = 112px
  
  // Crop aspect ratio constraints
  // Horizontal logos work best: width should be 1.5x to 4x height
  MIN_ASPECT_RATIO: 1.5,  // Minimum width:height ratio (horizontal)
  MAX_ASPECT_RATIO: 4.0,  // Maximum width:height ratio
  
  // Recommended crop dimensions (for guidance)
  RECOMMENDED_HEIGHT: 112,      // Match display height
  RECOMMENDED_MIN_WIDTH: 168,   // 1.5:1 ratio minimum (112 * 1.5)
  RECOMMENDED_MAX_WIDTH: 448,   // 4:1 ratio maximum (112 * 4)
  
  // File constraints
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  
  // Crop area constraints (for react-easy-crop)
  CROP_AREA_MIN_WIDTH: 150,
  CROP_AREA_MIN_HEIGHT: 100,
};

/**
 * 1:1 square crop for developer space images and developer-branding primary logo
 * (matches chapter switcher tiles and object-contain headers).
 */
export const SPACE_LOGO_CROP_CONSTRAINTS = {
  ASPECT_RATIO: 1,
  RECOMMENDED_SIZE: 400,
  CROP_AREA_MIN_SIZE: 100,
} as const;
