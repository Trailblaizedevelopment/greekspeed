import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  DONATION_HERO_IMAGE_BUCKET,
  DONATION_HERO_UPLOAD_ALLOWED_TYPES,
  DONATION_HERO_UPLOAD_MAX_BYTES,
} from '@/lib/constants/donationHeroImageConstants';
import { resolveDonationCampaignsApiContext } from '@/lib/services/donations/resolveDonationCampaignsApiContext';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trailblaizeChapterId } = await params;

    const ctx = await resolveDonationCampaignsApiContext(request, trailblaizeChapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
    }

    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const allowedMime = DONATION_HERO_UPLOAD_ALLOWED_TYPES as readonly string[];
    if (!allowedMime.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use JPEG, PNG, WebP, or GIF.' },
        { status: 400 }
      );
    }

    if (file.size > DONATION_HERO_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: `Image must be ${Math.floor(DONATION_HERO_UPLOAD_MAX_BYTES / (1024 * 1024))} MB or smaller` },
        { status: 400 }
      );
    }

    let ext = 'jpg';
    if (file.type === 'image/png') ext = 'png';
    else if (file.type === 'image/webp') ext = 'webp';
    else if (file.type === 'image/gif') ext = 'gif';

    const storagePath = `${trailblaizeChapterId}/${ctx.userId}/${Date.now()}.${ext}`;

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await serviceSupabase.storage
      .from(DONATION_HERO_IMAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('donation hero image upload:', uploadError);
      return NextResponse.json(
        { error: uploadError.message || 'Failed to upload image' },
        { status: 500 }
      );
    }

    const { data: urlData } = serviceSupabase.storage
      .from(DONATION_HERO_IMAGE_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;
    if (!publicUrl?.trim().toLowerCase().startsWith('https://')) {
      return NextResponse.json(
        { error: 'Storage did not return a valid https URL' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { publicUrl: publicUrl.trim() } }, { status: 201 });
  } catch (e) {
    console.error('POST donation upload-hero-image:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
