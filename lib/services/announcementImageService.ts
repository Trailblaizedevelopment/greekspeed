import { supabase } from '@/lib/supabase/client';

const BUCKET = 'announcement-images';

/** ~1MB cap for MMS-friendly payloads (tune if product asks) */
const MAX_FILE_SIZE = 1 * 1024 * 1024;

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;

export interface AnnouncementImageUploadResult {
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export class AnnouncementImageService {
  /**
   * Upload a single image for an announcement. Path: {userId}/{unique}.{ext}
   * Requires Storage RLS: first path segment must equal auth.uid().
   */
  static async uploadImage(file: File, userId: string): Promise<AnnouncementImageUploadResult> {
    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      throw new Error(
        `Invalid file type: ${file.type}. Only JPEG, PNG, and WebP are allowed.`
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit.`);
    }

    let fileExt = 'jpg';
    if (file.type === 'image/png') fileExt = 'png';
    else if (file.type === 'image/webp') fileExt = 'webp';

    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const { error } = await supabase.storage.from(BUCKET).upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

    if (error) {
      throw new Error(`Upload failed for "${file.name}": ${error.message}`);
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    return {
      url: urlData.publicUrl,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  }
}
