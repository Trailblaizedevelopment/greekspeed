import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Upload a data-URL image to `chapter-logos` (same bucket as branding logo upload).
 * Path is scoped under the space id for organization.
 */
export async function uploadChapterLogoFromDataUrl(
  supabase: SupabaseClient,
  spaceId: string,
  dataUrl: string
): Promise<string | null> {
  const trimmed = dataUrl.trim();
  const m = /^data:(image\/(?:jpeg|jpg|png|gif));base64,(.+)$/i.exec(trimmed);
  if (!m) return null;
  let mime = m[1]!.toLowerCase();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  const buf = Buffer.from(m[2]!, 'base64');
  if (buf.length > MAX_IMAGE_BYTES) return null;
  let ext = 'jpg';
  if (mime.includes('png')) ext = 'png';
  if (mime.includes('gif')) ext = 'gif';
  const path = `${spaceId}/initial-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('chapter-logos').upload(path, buf, {
    contentType: mime,
    upsert: false,
  });
  if (error) {
    console.error('uploadChapterLogoFromDataUrl:', error.message);
    return null;
  }
  const { data } = supabase.storage.from('chapter-logos').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Sets `chapter_branding.primary_logo_url` for a space (insert or patch).
 * Used when creating a shell space with an optional initial image.
 */
export async function upsertPrimaryLogoBrandingForSpace(
  supabase: SupabaseClient,
  params: {
    spaceId: string;
    logoPublicUrl: string;
    spaceDisplayName: string;
    actorUserId: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const rawAlt = params.spaceDisplayName.trim() || 'Chapter';
  const logoAlt = `${rawAlt} logo`.slice(0, 100);

  const { data: existing } = await supabase
    .from('chapter_branding')
    .select('id')
    .eq('chapter_id', params.spaceId)
    .maybeSingle();

  const patch = {
    primary_logo_url: params.logoPublicUrl,
    logo_alt_text: logoAlt,
    updated_at: now,
    updated_by: params.actorUserId,
  };

  if (existing?.id) {
    const { error } = await supabase.from('chapter_branding').update(patch).eq('chapter_id', params.spaceId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from('chapter_branding').insert({
    chapter_id: params.spaceId,
    primary_logo_url: params.logoPublicUrl,
    secondary_logo_url: null,
    logo_alt_text: logoAlt,
    primary_color: null,
    accent_color: null,
    organization_id: null,
    created_at: now,
    updated_at: now,
    created_by: params.actorUserId,
    updated_by: params.actorUserId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
