import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrowdedClient } from '@/lib/services/crowded/crowded-client';
import { CrowdedApiError } from '@/lib/services/crowded/crowded-client';

export type SyncDonationCampaignShareUrlCode =
  | 'NOT_FOUND'
  | 'NO_COLLECTION'
  | 'NO_LINK'
  | 'UPDATE_FAILED'
  | 'CROWDED_ERROR';

export async function syncDonationCampaignCrowdedShareUrl(params: {
  supabase: SupabaseClient;
  crowded: CrowdedClient;
  trailblaizeChapterId: string;
  crowdedChapterId: string;
  donationCampaignId: string;
}): Promise<
  | { ok: true; crowdedShareUrl: string; alreadySet: boolean }
  | { ok: false; error: string; code: SyncDonationCampaignShareUrlCode }
> {
  const { data: campaign, error: fetchErr } = await params.supabase
    .from('donation_campaigns')
    .select('id, chapter_id, crowded_collection_id, crowded_share_url')
    .eq('id', params.donationCampaignId)
    .eq('chapter_id', params.trailblaizeChapterId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message || 'Failed to load campaign', code: 'UPDATE_FAILED' };
  }
  if (!campaign) {
    return { ok: false, error: 'Donation campaign not found', code: 'NOT_FOUND' };
  }

  const existing = (campaign.crowded_share_url as string | null)?.trim();
  if (existing) {
    return { ok: true, crowdedShareUrl: existing, alreadySet: true };
  }

  const collectionId = (campaign.crowded_collection_id as string | null)?.trim();
  if (!collectionId) {
    return {
      ok: false,
      error: 'This campaign has no Crowded collection id — recreate the drive or contact support.',
      code: 'NO_COLLECTION',
    };
  }

  let crowdedRes;
  try {
    crowdedRes = await params.crowded.getCollection(params.crowdedChapterId, collectionId);
  } catch (e) {
    if (e instanceof CrowdedApiError) {
      return {
        ok: false,
        error: e.message || 'Crowded could not load this collection',
        code: 'CROWDED_ERROR',
      };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Crowded request failed',
      code: 'CROWDED_ERROR',
    };
  }

  const link = crowdedRes.data?.link?.trim();
  if (!link) {
    return {
      ok: false,
      error:
        'Crowded returned no share link for this collection yet. Check the collection in Crowded or try again later.',
      code: 'NO_LINK',
    };
  }

  const { error: upErr } = await params.supabase
    .from('donation_campaigns')
    .update({ crowded_share_url: link })
    .eq('id', params.donationCampaignId)
    .eq('chapter_id', params.trailblaizeChapterId);

  if (upErr) {
    return {
      ok: false,
      error: upErr.message || 'Failed to save share link',
      code: 'UPDATE_FAILED',
    };
  }

  return { ok: true, crowdedShareUrl: link, alreadySet: false };
}
