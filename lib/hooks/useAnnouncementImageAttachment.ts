'use client';

import { useCallback, useState } from 'react';
import type { ChangeEvent } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '@/lib/supabase/auth-context';
import { AnnouncementImageService } from '@/lib/services/announcementImageService';
import type { AnnouncementImageUploadResult } from '@/lib/services/announcementImageService';

const ACCEPT_TYPES = 'image/jpeg,image/jpg,image/png,image/webp';

export function useAnnouncementImageAttachment() {
  const { user } = useAuth();
  const [pendingImage, setPendingImage] = useState<AnnouncementImageUploadResult | null>(null);
  const [imageAlt, setImageAlt] = useState('');
  const [imageUploading, setImageUploading] = useState(false);

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      if (!user?.id) {
        toast.error('You must be signed in to attach an image');
        return;
      }

      setImageUploading(true);
      try {
        const result = await AnnouncementImageService.uploadImage(file, user.id);
        setPendingImage(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Image upload failed';
        toast.error(message);
      } finally {
        setImageUploading(false);
      }
    },
    [user?.id]
  );

  const removeImage = useCallback(() => {
    setPendingImage(null);
    setImageAlt('');
  }, []);

  const resetAttachment = useCallback(() => {
    removeImage();
  }, [removeImage]);

  const buildMetadata = useCallback((): Record<string, unknown> => {
    if (!pendingImage) return {};
    return {
      images: [
        {
          url: pendingImage.url,
          mimeType: pendingImage.mimeType,
          sizeBytes: pendingImage.sizeBytes,
          ...(imageAlt.trim() ? { alt: imageAlt.trim() } : {}),
        },
      ],
    };
  }, [pendingImage, imageAlt]);

  return {
    pendingImage,
    imageAlt,
    setImageAlt,
    imageUploading,
    handleFileChange,
    removeImage,
    resetAttachment,
    buildMetadata,
    acceptTypes: ACCEPT_TYPES,
  };
}
