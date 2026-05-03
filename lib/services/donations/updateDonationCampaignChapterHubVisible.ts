import type { SupabaseClient } from '@supabase/supabase-js';

function asMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

/**
 * When true, the drive appears in the chapter donation hub for any chapter member (not only recipients).
 * When false, it is only visible to members who appear in the recipients table.
 */
export async function updateDonationCampaignChapterHubVisible(params: {
  supabase: SupabaseClient;
  chapterId: string;
  campaignId: string;
  chapterHubVisible: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: fetchErr } = await params.supabase
    .from('donation_campaigns')
    .select('id, metadata')
    .eq('id', params.campaignId)
    .eq('chapter_id', params.chapterId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message || 'Failed to load campaign' };
  }
  if (!row) {
    return { ok: false, error: 'Campaign not found' };
  }

  const metadata = asMetadataRecord(row.metadata);
  metadata.chapter_hub_visible = params.chapterHubVisible;

  const { error: updErr } = await params.supabase
    .from('donation_campaigns')
    .update({
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.campaignId)
    .eq('chapter_id', params.chapterId);

  if (updErr) {
    return { ok: false, error: updErr.message || 'Failed to update campaign' };
  }

  return { ok: true };
}
