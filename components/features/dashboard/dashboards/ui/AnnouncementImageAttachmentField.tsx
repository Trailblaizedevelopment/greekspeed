'use client';

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AnnouncementImageUploadResult } from '@/lib/services/announcementImageService';

export interface AnnouncementImageAttachmentFieldProps {
  idSuffix: string;
  pendingImage: AnnouncementImageUploadResult | null;
  imageAlt: string;
  onAltChange: (value: string) => void;
  imageUploading: boolean;
  acceptTypes: string;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Shared with file input and drag-and-drop */
  processImageFile: (file: File) => void | Promise<void>;
  onRemove: () => void;
  disabled?: boolean;
}

export function AnnouncementImageAttachmentField({
  idSuffix,
  pendingImage,
  imageAlt,
  onAltChange,
  imageUploading,
  acceptTypes,
  onFileChange,
  processImageFile,
  onRemove,
  disabled,
}: AnnouncementImageAttachmentFieldProps) {
  const inputId = `announcement-image-${idSuffix}`;
  const altId = `announcement-image-alt-${idSuffix}`;
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  const endDrag = useCallback(() => {
    dragDepth.current = 0;
    setIsDragging(false);
  }, []);

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled || imageUploading) return;
      if (!e.dataTransfer.types?.includes('Files')) return;
      dragDepth.current += 1;
      setIsDragging(true);
    },
    [disabled, imageUploading]
  );

  const onDragLeave = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        endDrag();
      }
    },
    [endDrag]
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      endDrag();
      if (disabled || imageUploading) return;
      const file = e.dataTransfer.files?.[0];
      if (file) {
        void processImageFile(file);
      }
    },
    [disabled, imageUploading, processImageFile, endDrag]
  );

  return (
    <div className="space-y-2 rounded-lg border border-gray-200/80 bg-gray-50/50 p-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-0.5">
        Optional image
      </p>
      <p className="text-xs text-gray-500">
        JPEG, PNG, or WebP · max 1 MB · shown in email / MMS when enabled
      </p>

      {!pendingImage ? (
        <div
          role="presentation"
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className={cn(
            'rounded-lg border border-dashed border-transparent p-3 transition-colors',
            isDragging &&
              'border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/30 ring-offset-1',
            !disabled && !imageUploading && 'min-h-[88px]'
          )}
        >
          <p className="text-xs text-gray-500 mb-2 text-center sm:text-left">
            <span className="hidden sm:inline">Drop an image here or </span>
            <span className="sm:hidden">Tap </span>
            <span className="font-medium text-gray-700">Add image</span>
            <span className="hidden sm:inline"> — or tap the button</span>
            <span className="sm:hidden"> to choose a photo</span>
          </p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <input
              id={inputId}
              type="file"
              accept={acceptTypes}
              className="sr-only"
              onChange={onFileChange}
              disabled={disabled || imageUploading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-gray-300"
              disabled={disabled || imageUploading}
              onClick={() => document.getElementById(inputId)?.click()}
            >
              {imageUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4 mr-2" />
                  Add image
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative inline-block max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded preview */}
            <img
              src={pendingImage.url}
              alt={imageAlt || 'Announcement attachment preview'}
              className="max-h-40 max-w-full rounded-lg border border-gray-200 object-contain bg-white"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute top-1 right-1 h-8 w-8 rounded-full p-0 shadow-md bg-white/95"
              onClick={onRemove}
              disabled={disabled || imageUploading}
              aria-label="Remove image"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor={altId} className="text-xs text-gray-600">
              Alt text (optional)
            </Label>
            <Input
              id={altId}
              value={imageAlt}
              onChange={(e) => onAltChange(e.target.value)}
              placeholder="Describe the image for accessibility"
              className="text-sm"
              disabled={disabled || imageUploading}
              maxLength={500}
            />
          </div>
        </div>
      )}
    </div>
  );
}
