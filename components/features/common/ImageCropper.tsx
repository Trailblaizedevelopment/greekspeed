'use client';

import { useState, useCallback, useEffect } from 'react';
import CropperLib from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Check, X, RotateCw } from 'lucide-react';
import type { Area, Point } from 'react-easy-crop';
import { AVATAR_CONSTRAINTS, BANNER_CONSTRAINTS, DONATION_HERO_CONSTRAINTS } from '@/lib/constants/imageConstants';
import { LOGO_CONSTRAINTS } from '@/lib/constants/logoConstants';

// Type-safe wrapper for react-easy-crop to fix React 19 compatibility
const Cropper = CropperLib as any;

// Minimal CSS for react-easy-crop (package doesn't export CSS file)
const cropperStyles = `
  .reactEasyCrop_Container {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .reactEasyCrop_Image {
    max-width: unset;
  }
  .reactEasyCrop_CropArea {
    border: 2px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 0 0 9999em rgba(0, 0, 0, 0.5);
  }
  .reactEasyCrop_CropAreaGrid {
    border: 1px solid rgba(255, 255, 255, 0.5);
  }
`;

export type CropType = 'avatar' | 'banner' | 'logo' | 'donation_hero';

interface ImageCropperProps {
  /** Image source (data URL or URL) */
  imageSrc: string;
  /** Whether the cropper modal is open */
  isOpen: boolean;
  /** Callback when crop is cancelled */
  onClose: () => void;
  /** Callback when crop is completed with cropped image blob */
  onCropComplete: (croppedImageBlob: Blob) => void;
  /** Type of crop (avatar, banner, or logo) */
  cropType: CropType;
  /** Use higher z-index so dialog appears above edit-profile drawer (z-[10005]) */
  elevatedZIndex?: boolean;
}

/**
 * ImageCropper Component
 * 
 * Generic image cropping component that supports avatars (square), banners (wide),
 * logos (horizontal), and donation hero images (square 1:1) with appropriate aspect ratios and constraints.
 */
export function ImageCropper({
  imageSrc,
  isOpen,
  onClose,
  onCropComplete,
  cropType,
  elevatedZIndex = false,
}: ImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Get constraints based on crop type
  const getConstraints = () => {
    switch (cropType) {
      case 'avatar':
        return {
          aspectRatio: AVATAR_CONSTRAINTS.ASPECT_RATIO,
          minAspectRatio: AVATAR_CONSTRAINTS.ASPECT_RATIO,
          maxAspectRatio: AVATAR_CONSTRAINTS.ASPECT_RATIO,
          targetWidth: AVATAR_CONSTRAINTS.RECOMMENDED_SIZE,
          targetHeight: AVATAR_CONSTRAINTS.RECOMMENDED_SIZE,
          minSize: AVATAR_CONSTRAINTS.CROP_AREA_MIN_SIZE,
          recommendedDimensions: `${AVATAR_CONSTRAINTS.RECOMMENDED_SIZE}x${AVATAR_CONSTRAINTS.RECOMMENDED_SIZE}px`,
          title: 'Crop Avatar',
          description: 'Crop your profile picture. Recommended size: square (1:1 aspect ratio).',
        };
      case 'banner':
        return {
          aspectRatio: BANNER_CONSTRAINTS.ASPECT_RATIO,
          minAspectRatio: BANNER_CONSTRAINTS.MIN_ASPECT_RATIO,
          maxAspectRatio: BANNER_CONSTRAINTS.MAX_ASPECT_RATIO,
          targetWidth: BANNER_CONSTRAINTS.RECOMMENDED_WIDTH,
          targetHeight: BANNER_CONSTRAINTS.RECOMMENDED_HEIGHT,
          minSize: BANNER_CONSTRAINTS.CROP_AREA_MIN_HEIGHT,
          recommendedDimensions: `${BANNER_CONSTRAINTS.RECOMMENDED_WIDTH}x${BANNER_CONSTRAINTS.RECOMMENDED_HEIGHT}px`,
          title: 'Crop Banner',
          description: 'Crop your banner image. Recommended aspect ratio: 4.7:1 (wide).',
        };
      case 'logo':
        return {
          aspectRatio: (LOGO_CONSTRAINTS.MIN_ASPECT_RATIO + LOGO_CONSTRAINTS.MAX_ASPECT_RATIO) / 2,
          minAspectRatio: LOGO_CONSTRAINTS.MIN_ASPECT_RATIO,
          maxAspectRatio: LOGO_CONSTRAINTS.MAX_ASPECT_RATIO,
          targetWidth: LOGO_CONSTRAINTS.RECOMMENDED_MAX_WIDTH,
          targetHeight: LOGO_CONSTRAINTS.DISPLAY_HEIGHT,
          minSize: LOGO_CONSTRAINTS.CROP_AREA_MIN_HEIGHT,
          recommendedDimensions: `${LOGO_CONSTRAINTS.RECOMMENDED_MIN_WIDTH}x${LOGO_CONSTRAINTS.RECOMMENDED_HEIGHT}px to ${LOGO_CONSTRAINTS.RECOMMENDED_MAX_WIDTH}x${LOGO_CONSTRAINTS.RECOMMENDED_HEIGHT}px`,
          title: 'Crop Logo',
          description: 'Crop your logo. Must be horizontal (width > height).',
        };
      case 'donation_hero':
        return {
          aspectRatio: DONATION_HERO_CONSTRAINTS.ASPECT_RATIO,
          minAspectRatio: DONATION_HERO_CONSTRAINTS.ASPECT_RATIO,
          maxAspectRatio: DONATION_HERO_CONSTRAINTS.ASPECT_RATIO,
          targetWidth: DONATION_HERO_CONSTRAINTS.RECOMMENDED_SIZE,
          targetHeight: DONATION_HERO_CONSTRAINTS.RECOMMENDED_SIZE,
          minSize: DONATION_HERO_CONSTRAINTS.CROP_AREA_MIN_SIZE,
          recommendedDimensions: `${DONATION_HERO_CONSTRAINTS.RECOMMENDED_SIZE}x${DONATION_HERO_CONSTRAINTS.RECOMMENDED_SIZE}px`,
          title: 'Crop donation image',
          description: 'Square 1:1 image for your donation (Stripe product image and chapter views).',
        };
    }
  };

  const constraints = getConstraints();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setCroppedAreaPixels(null);
      setIsProcessing(false);
    }
  }, [isOpen]);

  /**
   * Validate cropped area meets constraints
   */
  const validateCropArea = useCallback((area: Area): string | null => {
    const aspectRatio = area.width / area.height;

    if (cropType === 'avatar' || cropType === 'donation_hero') {
      if (Math.abs(aspectRatio - 1) > 0.1) {
        return cropType === 'donation_hero'
          ? 'Donation image must be square (1:1 aspect ratio)'
          : 'Avatar must be square (1:1 aspect ratio)';
      }
      if (area.width < constraints.minSize || area.height < constraints.minSize) {
        return cropType === 'donation_hero'
          ? `Donation image size too small. Minimum: ${constraints.minSize}x${constraints.minSize}px`
          : `Avatar size too small. Minimum: ${constraints.minSize}x${constraints.minSize}px`;
      }
    } else if (cropType === 'banner') {
      if (aspectRatio < constraints.minAspectRatio) {
        return `Banner must be wider. Current ratio: ${aspectRatio.toFixed(2)}:1. Minimum: ${constraints.minAspectRatio}:1`;
      }
      if (aspectRatio > constraints.maxAspectRatio) {
        return `Banner aspect ratio too wide. Current: ${aspectRatio.toFixed(2)}:1. Maximum: ${constraints.maxAspectRatio}:1`;
      }
      if (area.height < constraints.minSize) {
        return `Banner height too small. Minimum: ${constraints.minSize}px`;
      }
    } else if (cropType === 'logo') {
      if (aspectRatio < LOGO_CONSTRAINTS.MIN_ASPECT_RATIO) {
        return `Logo must be horizontal. Current ratio: ${aspectRatio.toFixed(2)}:1. Minimum: ${LOGO_CONSTRAINTS.MIN_ASPECT_RATIO}:1`;
      }
      if (aspectRatio > LOGO_CONSTRAINTS.MAX_ASPECT_RATIO) {
        return `Logo aspect ratio too wide. Current: ${aspectRatio.toFixed(2)}:1. Maximum: ${LOGO_CONSTRAINTS.MAX_ASPECT_RATIO}:1`;
      }
      if (area.height < LOGO_CONSTRAINTS.CROP_AREA_MIN_HEIGHT) {
        return `Logo height too small. Minimum: ${LOGO_CONSTRAINTS.CROP_AREA_MIN_HEIGHT}px`;
      }
    }

    return null;
  }, [cropType, constraints]);

  /**
   * Create cropped image blob from canvas
   */
  const createCroppedImage = useCallback(async (
    imageSrc: string,
    pixelCrop: Area,
    rotation: number
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = imageSrc;

      image.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Calculate rotated dimensions
        const rotationRad = (rotation * Math.PI) / 180;
        const rotatedWidth = Math.abs(image.width * Math.cos(rotationRad)) + Math.abs(image.height * Math.sin(rotationRad));
        const rotatedHeight = Math.abs(image.width * Math.sin(rotationRad)) + Math.abs(image.height * Math.cos(rotationRad));

        // Set canvas size to rotated dimensions
        canvas.width = rotatedWidth;
        canvas.height = rotatedHeight;

        // Translate and rotate context
        ctx.translate(rotatedWidth / 2, rotatedHeight / 2);
        ctx.rotate(rotationRad);
        ctx.translate(-image.width / 2, -image.height / 2);

        // Draw rotated image
        ctx.drawImage(image, 0, 0);

        // Create new canvas for cropped area
        const croppedCanvas = document.createElement('canvas');
        const croppedCtx = croppedCanvas.getContext('2d');

        if (!croppedCtx) {
          reject(new Error('Failed to get cropped canvas context'));
          return;
        }

        // Calculate target dimensions based on crop type
        let finalWidth: number;
        let finalHeight: number;

        if (cropType === 'avatar' || cropType === 'donation_hero') {
          finalWidth = constraints.targetWidth;
          finalHeight = constraints.targetHeight;
        } else if (cropType === 'banner') {
          // Banner - maintain aspect ratio, scale to target width
          const aspectRatio = pixelCrop.width / pixelCrop.height;
          finalWidth = constraints.targetWidth;
          finalHeight = Math.round(finalWidth / aspectRatio);
        } else {
          // Logo - similar to banner but with max width constraint
          const aspectRatio = pixelCrop.width / pixelCrop.height;
          const targetHeight = constraints.targetHeight;
          const targetWidth = Math.round(targetHeight * aspectRatio);
          finalWidth = Math.min(targetWidth, constraints.targetWidth);
          finalHeight = Math.round(finalWidth / aspectRatio);
        }

        croppedCanvas.width = finalWidth;
        croppedCanvas.height = finalHeight;

        // Draw cropped portion, scaled to target dimensions
        croppedCtx.drawImage(
          canvas,
          pixelCrop.x,
          pixelCrop.y,
          pixelCrop.width,
          pixelCrop.height,
          0,
          0,
          finalWidth,
          finalHeight
        );

        // Convert to blob
        croppedCanvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob'));
            }
          },
          'image/jpeg',
          0.92
        );
      };

      image.onerror = () => reject(new Error('Failed to load image'));
    });
  }, [cropType, constraints]);

  /**
   * Handle crop completion
   */
  const handleCropComplete = useCallback(async () => {
    if (!croppedAreaPixels) {
      return;
    }

    // Validate crop area
    const validationError = validateCropArea(croppedAreaPixels);
    if (validationError) {
      console.warn('Crop validation warning:', validationError);
      // Still allow crop but warn user
    }

    setIsProcessing(true);

    try {
      const croppedBlob = await createCroppedImage(
        imageSrc,
        croppedAreaPixels,
        rotation
      );

      onCropComplete(croppedBlob);
      handleClose();
    } catch (error) {
      console.error('Error creating cropped image:', error);
      alert('Failed to crop image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [croppedAreaPixels, imageSrc, rotation, validateCropArea, onCropComplete, createCroppedImage]);

  /**
   * Handle close/reset
   */
  const handleClose = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    onClose();
  }, [onClose]);

  /**
   * Handle crop area change
   */
  const onCropChange = useCallback((crop: Point) => {
    setCrop(crop);
  }, []);

  /**
   * Handle zoom change
   */
  const onZoomChange = useCallback((zoom: number) => {
    setZoom(zoom);
  }, []);

  /**
   * Handle crop complete (area selection)
   */
  const onCropAreaComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <style dangerouslySetInnerHTML={{ __html: cropperStyles }} />
      <DialogContent
        className={elevatedZIndex ? 'max-w-4xl max-h-[90vh] flex flex-col p-0 z-[10005]' : 'max-w-4xl max-h-[90vh] flex flex-col p-0'}
        overlayClassName={elevatedZIndex ? 'z-[10005]' : undefined}
      >
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <DialogTitle>{constraints.title}</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            <strong>Click and drag</strong> the image to reposition it, or use zoom/rotation controls below.
            {constraints.description} Recommended dimensions: {constraints.recommendedDimensions}
          </p>
        </DialogHeader>

        {/* Middle Section - Side by Side Layout */}
        <div className="flex-1 overflow-hidden px-6 py-4">
          <div className="flex gap-6 h-full">
            {/* Cropper Section - Left Side (60%) */}
            <div className="flex-shrink-0 w-[60%] flex items-center">
              <div className="relative w-full h-[400px] bg-gray-100 rounded-lg overflow-hidden">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={constraints.aspectRatio}
                  onCropChange={onCropChange}
                  onZoomChange={onZoomChange}
                  onCropComplete={onCropAreaComplete}
                  cropShape={cropType === 'avatar' ? 'round' : 'rect'}
                  showGrid={true}
                  restrictPosition={false}
                  minZoom={0.5}
                  maxZoom={1}
                  style={{
                    containerStyle: {
                      width: '100%',
                      height: '100%',
                    },
                  }}
                />
              </div>
            </div>

            {/* Controls Section - Right Side (40%) */}
            <div className="flex-1 space-y-4 min-w-0 overflow-y-auto">
              {/* Zoom Control */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Zoom: {Math.round(zoom * 100)}%
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.01"
                  value={zoom}
                  onChange={(e) => onZoomChange(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Rotation Control */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Rotation: {rotation}°
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRotation(rotation - 90)}
                    className="flex-1"
                  >
                    <RotateCw className="h-4 w-4 mr-1 rotate-180" />
                    -90°
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRotation(0)}
                    className="flex-1"
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRotation(rotation + 90)}
                    className="flex-1"
                  >
                    <RotateCw className="h-4 w-4 mr-1" />
                    +90°
                  </Button>
                </div>
              </div>

              {/* Aspect Ratio Info */}
              <div className="pt-4 border-t">
                <p className="text-xs text-gray-500">
                  <strong>Current crop:</strong> {croppedAreaPixels 
                    ? `${Math.round(croppedAreaPixels.width)}x${Math.round(croppedAreaPixels.height)}px (${(croppedAreaPixels.width / croppedAreaPixels.height).toFixed(2)}:1)`
                    : 'Select crop area'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  <strong>Target size:</strong> {constraints.recommendedDimensions}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Footer */}
        <DialogFooter className="px-6 py-4 border-t gap-2 flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCropComplete}
            disabled={isProcessing || !croppedAreaPixels}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white"
          >
            {isProcessing ? (
              <>
                <div className="h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save & Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
