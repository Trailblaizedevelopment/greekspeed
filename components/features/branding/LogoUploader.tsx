'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, X, Image as ImageIcon, Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/supabase/auth-context';
import { LogoCropper, type LogoCropMode } from './LogoCropper';
import { LOGO_CONSTRAINTS, SPACE_LOGO_CROP_CONSTRAINTS } from '@/lib/constants/logoConstants';

interface LogoUploaderProps {
  /** Logo variant: 'primary' or 'secondary' */
  variant: 'primary' | 'secondary';
  /** Chapter ID for the logo upload */
  chapterId: string;
  /** Callback when upload completes successfully */
  onUploadComplete: (url: string) => void;
  /** Current logo URL to display (optional) */
  currentLogoUrl?: string | null;
  /** Callback when logo is removed (optional) */
  onRemove?: () => void;
  /** Default logo URL for reset functionality (optional) */
  defaultLogoUrl?: string | null;
  /** Additional className for styling */
  className?: string;
  /** Raster images only: horizontal header logo vs square 1:1 (developer primary logo). SVG skips cropping. */
  rasterCropMode?: LogoCropMode;
}

/**
 * LogoUploader Component
 * 
 * A reusable component for uploading chapter logos with drag-and-drop support,
 * preview, validation, and progress tracking.
 */
export function LogoUploader({
  variant,
  chapterId,
  onUploadComplete,
  currentLogoUrl,
  onRemove,
  defaultLogoUrl,
  className,
  rasterCropMode = 'horizontal',
}: LogoUploaderProps) {
  const { session } = useAuth();
  const [preview, setPreview] = useState<string | null>(currentLogoUrl || null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Allowed file types
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  /**
   * Validate file type and size
   */
  const validateFile = (file: File): string | null => {
    if (!allowedTypes.includes(file.type)) {
      return 'Invalid file type. Only JPEG, PNG, GIF, and SVG images are allowed.';
    }

    if (file.size > maxSize) {
      return 'File size must be less than 5MB.';
    }

    return null;
  };

  /**
   * Create preview from file using FileReader
   */
  const createPreview = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  /**
   * Upload file to API
   */
  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Validate session before making request
      if (!session?.access_token) {
        throw new Error('Session expired. Please log in again.');
      }

      // Validate file
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        toast.error(validationError);
        setUploading(false);
        return;
      }

      // Create preview
      try {
        const previewUrl = await createPreview(file);
        setPreview(previewUrl);
      } catch (previewError) {
        console.error('Error creating preview:', previewError);
        // Continue with upload even if preview fails
      }

      // Simulate progress (since we can't track actual upload progress with fetch)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      // Create FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chapterId', chapterId);
      formData.append('variant', variant);

      // Upload to API with Authorization header
      const response = await fetch('/api/branding/upload-logo', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || 'Failed to upload logo');
      }

      const data = await response.json();

      if (!data.success || !data.url) {
        throw new Error('Invalid response from server');
      }

      // Update preview with actual URL
      setPreview(data.url);
      setUploadProgress(0);
      setUploading(false);

      // Call success callback
      onUploadComplete(data.url);
      toast.success(`${variant === 'primary' ? 'Primary' : 'Secondary'} logo uploaded successfully!`);
    } catch (error) {
      console.error('Error uploading logo:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload logo';
      setError(errorMessage);
      setUploadProgress(0);
      setUploading(false);
      toast.error(errorMessage);
    }
  };

  /**
   * Handle file selection from input
   */
  const handleFileSelect = useCallback(async (file: File) => {
    // Basic validation
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      return;
    }

    // Skip SVG files (vector graphics don't need cropping)
    if (file.type === 'image/svg+xml') {
      await uploadFile(file);
      return;
    }

    // For raster images, show cropper
    try {
      const previewUrl = await createPreview(file);
      setImageToCrop(previewUrl);
      setShowCropper(true);
    } catch (error) {
      console.error('Error creating preview:', error);
      setError('Failed to load image for cropping');
      toast.error('Failed to load image');
    }
  }, [validateFile, createPreview, uploadFile]);

  /**
   * Handle file input change
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input to allow re-uploading the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Handle drag and drop events
   */
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  /**
   * Handle remove logo
   */
  const handleRemove = () => {
    setPreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onRemove) {
      onRemove();
    }
    toast.info(`${variant === 'primary' ? 'Primary' : 'Secondary'} logo removed`);
  };

  /**
   * Handle reset to default logo
   */
  const handleReset = () => {
    if (defaultLogoUrl) {
      setPreview(defaultLogoUrl);
      setError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onUploadComplete(defaultLogoUrl);
      toast.info(`${variant === 'primary' ? 'Primary' : 'Secondary'} logo reset to default`);
    }
  };

  /**
   * Trigger file input click
   */
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Handle crop completion
   */
  const handleCropComplete = useCallback(async (croppedBlob: Blob) => {
    setShowCropper(false);
    setImageToCrop(null);
    
    // Convert blob to File
    const croppedFile = new File(
      [croppedBlob],
      `cropped-logo-${Date.now()}.png`,
      { type: 'image/png' }
    );
    
    // Upload the cropped file
    await uploadFile(croppedFile);
  }, [uploadFile]);

  /**
   * Handle cropper close
   */
  const handleCropperClose = useCallback(() => {
    setShowCropper(false);
    setImageToCrop(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          {variant === 'primary' ? 'Primary' : 'Secondary'} Logo
        </label>
        <div className="flex items-center gap-2">
          {/* Reset to Default Button */}
          {defaultLogoUrl && (preview || currentLogoUrl) && !uploading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-gray-600 hover:text-gray-900"
              title={`Reset to default ${variant === 'primary' ? 'primary' : 'secondary'} logo`}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          {/* Remove Button */}
          {preview && !uploading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="h-4 w-4 mr-1" />
              Remove
            </Button>
          )}
        </div>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!preview ? handleClick : undefined}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer',
          isDragging
            ? 'border-brand-primary bg-brand-primary/5'
            : 'border-gray-300 hover:border-gray-400',
          preview && 'cursor-default',
          uploading && 'opacity-50 cursor-not-allowed'
        )}
      >
        {uploading ? (
          // Uploading State
          <div className="flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 text-brand-primary animate-spin" />
            <div className="text-sm text-gray-600">Uploading logo...</div>
            {uploadProgress > 0 && (
              <div className="w-full max-w-xs">
                <Progress value={uploadProgress} className="h-2" />
                <div className="text-xs text-gray-500 mt-1 text-center">
                  {uploadProgress}%
                </div>
              </div>
            )}
          </div>
        ) : preview ? (
          // Preview State
          <div className="relative">
            <div className="flex items-center justify-center bg-gray-50 rounded-lg p-4 border border-gray-200">
              <img
                src={preview}
                alt={`${variant} logo preview`}
                className="max-h-32 max-w-full object-contain"
              />
            </div>
            {!currentLogoUrl && (
              <div className="mt-3 flex items-center justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClick}
                  disabled={uploading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Replace Logo
                </Button>
              </div>
            )}
          </div>
        ) : (
          // Empty State
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="rounded-full bg-gray-100 p-3">
              <ImageIcon className="h-6 w-6 text-gray-400" />
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-gray-700">
                {isDragging ? 'Drop logo here' : 'Click to upload or drag and drop'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                PNG, SVG, JPG, GIF up to 5MB
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClick}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              Choose File
            </Button>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/gif,image/svg+xml"
          onChange={handleInputChange}
          className="hidden"
          disabled={uploading}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {error}
        </div>
      )}

      {/* Help Text */}
      <p className="text-xs text-gray-500">
        {rasterCropMode === 'square' ? (
          <>
            Square 1:1 crop recommended ({SPACE_LOGO_CROP_CONSTRAINTS.RECOMMENDED_SIZE}px output). SVG files are
            accepted without cropping.
          </>
        ) : (
          <>
            Required: Horizontal logo (width &gt; height), dimensions {LOGO_CONSTRAINTS.RECOMMENDED_MIN_WIDTH}x
            {LOGO_CONSTRAINTS.RECOMMENDED_HEIGHT}px to {LOGO_CONSTRAINTS.RECOMMENDED_MAX_WIDTH}x
            {LOGO_CONSTRAINTS.RECOMMENDED_HEIGHT}px. You&apos;ll be able to crop your logo after upload. SVG files are
            accepted without cropping.
          </>
        )}
      </p>

      {/* Logo Cropper Modal */}
      {imageToCrop && (
        <LogoCropper
          imageSrc={imageToCrop}
          isOpen={showCropper}
          onClose={handleCropperClose}
          onCropComplete={handleCropComplete}
          cropMode={rasterCropMode}
        />
      )}
    </div>
  );
}


