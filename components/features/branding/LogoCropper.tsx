'use client';

import { useState, useCallback, useEffect } from 'react';
import CropperLib from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Check, X, RotateCw } from 'lucide-react';
import { LOGO_CONSTRAINTS, SPACE_LOGO_CROP_CONSTRAINTS } from '@/lib/constants/logoConstants';
import type { Area, Point } from 'react-easy-crop';

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

export type LogoCropMode = 'horizontal' | 'square';

interface LogoCropperProps {
  /** Image source (data URL or URL) */
  imageSrc: string;
  /** Whether the cropper modal is open */
  isOpen: boolean;
  /** Callback when crop is cancelled */
  onClose: () => void;
  /** Callback when crop is completed with cropped image blob */
  onCropComplete: (croppedImageBlob: Blob) => void;
  /** `horizontal` = chapter header logo band; `square` = 1:1 for dev primary / space tile */
  cropMode?: LogoCropMode;
}

/**
 * LogoCropper — raster chapter logos: horizontal header band (`horizontal`)
 * or square 1:1 (`square`) for developer primary / space tile uploads.
 */
export function LogoCropper({
  imageSrc,
  isOpen,
  onClose,
  onCropComplete,
  cropMode = 'horizontal',
}: LogoCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
   * Calculate aspect ratio from cropped area
   */
  const getAspectRatio = useCallback((area: Area): number => {
    return area.width / area.height;
  }, []);

  /**
   * Validate cropped area meets constraints
   */
  const validateCropArea = useCallback((area: Area): string | null => {
    const aspectRatio = getAspectRatio(area);

    if (cropMode === 'square') {
      if (Math.abs(aspectRatio - 1) > 0.08) {
        return `Image must be square (1:1). Current ratio: ${aspectRatio.toFixed(2)}:1`;
      }
      if (
        area.width < SPACE_LOGO_CROP_CONSTRAINTS.CROP_AREA_MIN_SIZE ||
        area.height < SPACE_LOGO_CROP_CONSTRAINTS.CROP_AREA_MIN_SIZE
      ) {
        return `Crop too small. Minimum: ${SPACE_LOGO_CROP_CONSTRAINTS.CROP_AREA_MIN_SIZE}x${SPACE_LOGO_CROP_CONSTRAINTS.CROP_AREA_MIN_SIZE}px`;
      }
      return null;
    }

    if (aspectRatio < LOGO_CONSTRAINTS.MIN_ASPECT_RATIO) {
      return `Logo must be horizontal. Current ratio: ${aspectRatio.toFixed(2)}:1. Minimum: ${LOGO_CONSTRAINTS.MIN_ASPECT_RATIO}:1`;
    }

    if (aspectRatio > LOGO_CONSTRAINTS.MAX_ASPECT_RATIO) {
      return `Logo aspect ratio too wide. Current: ${aspectRatio.toFixed(2)}:1. Maximum: ${LOGO_CONSTRAINTS.MAX_ASPECT_RATIO}:1`;
    }

    if (area.height < LOGO_CONSTRAINTS.CROP_AREA_MIN_HEIGHT) {
      return `Logo height too small. Minimum: ${LOGO_CONSTRAINTS.CROP_AREA_MIN_HEIGHT}px`;
    }

    if (area.width < LOGO_CONSTRAINTS.CROP_AREA_MIN_WIDTH) {
      return `Logo width too small. Minimum: ${LOGO_CONSTRAINTS.CROP_AREA_MIN_WIDTH}px`;
    }

    return null;
  }, [cropMode, getAspectRatio]);

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

        const aspectRatio = pixelCrop.width / pixelCrop.height;
        let finalWidth: number;
        let finalHeight: number;

        if (cropMode === 'square') {
          finalWidth = SPACE_LOGO_CROP_CONSTRAINTS.RECOMMENDED_SIZE;
          finalHeight = SPACE_LOGO_CROP_CONSTRAINTS.RECOMMENDED_SIZE;
        } else {
          // Match header-friendly export (horizontal band)
          const targetHeight = LOGO_CONSTRAINTS.DISPLAY_HEIGHT;
          const targetWidth = Math.round(targetHeight * aspectRatio);
          finalWidth = Math.min(targetWidth, LOGO_CONSTRAINTS.RECOMMENDED_MAX_WIDTH);
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
          'image/png',
          0.95
        );
      };

      image.onerror = () => reject(new Error('Failed to load image'));
    });
  }, [cropMode]);

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
      // Show error but don't prevent - let user adjust
      console.warn('Crop validation warning:', validationError);
      // You could show a toast here if desired
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
      // Handle error (show toast, etc.)
    } finally {
      setIsProcessing(false);
    }
  }, [croppedAreaPixels, imageSrc, rotation, validateCropArea, onCropComplete]);

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

  /**
   * Aspect ratio for react-easy-crop overlay
   */
  const cropAspectRatio =
    cropMode === 'square'
      ? 1
      : (LOGO_CONSTRAINTS.MIN_ASPECT_RATIO + LOGO_CONSTRAINTS.MAX_ASPECT_RATIO) / 2;

  const dialogTitle = cropMode === 'square' ? 'Crop space image' : 'Crop Logo';
  const dialogBlurb =
    cropMode === 'square'
      ? `Square 1:1 crop for space branding. Recommended output: ${SPACE_LOGO_CROP_CONSTRAINTS.RECOMMENDED_SIZE}x${SPACE_LOGO_CROP_CONSTRAINTS.RECOMMENDED_SIZE}px.`
      : `Logo must be horizontal (width > height). Recommended dimensions: ${LOGO_CONSTRAINTS.RECOMMENDED_MIN_WIDTH}x${LOGO_CONSTRAINTS.RECOMMENDED_HEIGHT}px to ${LOGO_CONSTRAINTS.RECOMMENDED_MAX_WIDTH}x${LOGO_CONSTRAINTS.RECOMMENDED_HEIGHT}px.`;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <style dangerouslySetInnerHTML={{ __html: cropperStyles }} />
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            <strong>Click and drag</strong> the image to reposition it, or use zoom/rotation controls below. {dialogBlurb}
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
                  aspect={cropAspectRatio}
                  onCropChange={onCropChange}
                  onZoomChange={onZoomChange}
                  onCropComplete={onCropAreaComplete}
                  cropShape="rect"
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
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Rotation: {rotation}°
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  >
                    <RotateCw className="h-4 w-4 mr-2" />
                    Rotate 90°
                  </Button>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="1"
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Aspect Ratio Info */}
              {croppedAreaPixels ? (
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                  <strong>Current aspect ratio:</strong> {(croppedAreaPixels.width / croppedAreaPixels.height).toFixed(2)}:1
                  {(() => {
                    const ratio = croppedAreaPixels.width / croppedAreaPixels.height;
                    if (cropMode === 'square') {
                      if (Math.abs(ratio - 1) > 0.08) {
                        return <span className="text-orange-600 ml-2">⚠ Not 1:1</span>;
                      }
                      return <span className="text-green-600 ml-2">✓ 1:1</span>;
                    }
                    if (ratio < LOGO_CONSTRAINTS.MIN_ASPECT_RATIO) {
                      return <span className="text-orange-600 ml-2">⚠ Too vertical</span>;
                    }
                    if (ratio > LOGO_CONSTRAINTS.MAX_ASPECT_RATIO) {
                      return <span className="text-orange-600 ml-2">⚠ Too wide</span>;
                    }
                    return <span className="text-green-600 ml-2">✓ Good</span>;
                  })()}
                </div>
              ) : (
                <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded">
                  Adjust the image to see aspect ratio information...
                </div>
              )}
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
            className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCropComplete}
            disabled={isProcessing || !croppedAreaPixels}
            className="rounded-full bg-brand-primary hover:bg-brand-primary-hover text-white shadow-lg shadow-navy-100/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <div className="h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                {cropMode === 'square' ? 'Save & upload' : 'Save & Upload Logo'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
