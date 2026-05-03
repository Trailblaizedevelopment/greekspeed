import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import type { DonationCampaign } from '@/types/donationCampaigns';
import { isDonationCampaignStripeDrive } from '@/types/donationCampaigns';

function asMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

export type PatchDonationCampaignInput = {
  chapterHubVisible?: boolean;
  title?: string;
  description?: string | null;
  heroImageUrl?: string | null;
  showOnPublicFundraisingChannels?: boolean;
};

/**
 * Treasurer PATCH for `donation_campaigns`: hub visibility, copy, hero art, and fundraiser metadata.
 * Syncs Product name/description/images on the connected account when title, description, or hero change.
 */
export async function patchDonationCampaign(params: {
  supabase: SupabaseClient;
  stripe: Stripe | null;
  stripeConnectAccountId: string | null;
  chapterId: string;
  campaignId: string;
  patch: PatchDonationCampaignInput;
}): Promise<
  | { ok: true; campaign: DonationCampaign }
  | { ok: false; error: string; httpStatus: number }
> {
  const hasAny =
    params.patch.chapterHubVisible !== undefined ||
    params.patch.title !== undefined ||
    params.patch.description !== undefined ||
    params.patch.heroImageUrl !== undefined ||
    params.patch.showOnPublicFundraisingChannels !== undefined;

  if (!hasAny) {
    return { ok: false, error: 'At least one field is required', httpStatus: 400 };
  }

  const { data: row, error: fetchErr } = await params.supabase
    .from('donation_campaigns')
    .select('*')
    .eq('id', params.campaignId)
    .eq('chapter_id', params.chapterId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message || 'Failed to load campaign', httpStatus: 500 };
  }
  if (!row) {
    return { ok: false, error: 'Campaign not found', httpStatus: 404 };
  }

  const campaign = row as DonationCampaign;
  if (!isDonationCampaignStripeDrive(campaign)) {
    return { ok: false, error: 'This campaign cannot be edited here', httpStatus: 400 };
  }

  const nextTitle =
    params.patch.title !== undefined ? params.patch.title.trim() : campaign.title.trim();
  if (!nextTitle) {
    return { ok: false, error: 'Title cannot be empty', httpStatus: 400 };
  }

  const nextDescription =
    params.patch.description !== undefined
      ? params.patch.description === null ||
          params.patch.description === '' ||
          !String(params.patch.description).trim()
        ? null
        : String(params.patch.description).trim()
      : (campaign.description as string | null | undefined) ?? null;

  const nextHero =
    params.patch.heroImageUrl !== undefined
      ? params.patch.heroImageUrl === null ||
          params.patch.heroImageUrl === '' ||
          !String(params.patch.heroImageUrl).trim()
        ? null
        : String(params.patch.heroImageUrl).trim()
      : (campaign.hero_image_url as string | null | undefined) ?? null;

  const metadata = asMetadataRecord(campaign.metadata);

  if (params.patch.chapterHubVisible !== undefined) {
    metadata.chapter_hub_visible = params.patch.chapterHubVisible;
  }

  if (params.patch.showOnPublicFundraisingChannels !== undefined) {
    const k = campaign.kind;
    if (k === 'fundraiser' || k === 'fixed') {
      metadata.showOnPublicFundraisingChannels = params.patch.showOnPublicFundraisingChannels;
    }
  }

  const needsStripeProductUpdate =
    params.patch.title !== undefined ||
    params.patch.description !== undefined ||
    params.patch.heroImageUrl !== undefined;

  const productId = campaign.stripe_product_id?.trim();
  if (needsStripeProductUpdate) {
    if (!productId) {
      return { ok: false, error: 'Campaign is missing Stripe product', httpStatus: 400 };
    }
    const connectId = params.stripeConnectAccountId?.trim();
    if (!connectId) {
      return { ok: false, error: 'Chapter Stripe Connect account is missing', httpStatus: 400 };
    }
    if (!params.stripe) {
      return { ok: false, error: 'Stripe is not configured', httpStatus: 503 };
    }

    const descForStripe =
      nextDescription != null && String(nextDescription).trim()
        ? String(nextDescription).trim()
        : '';

    let images: string[] = [];
    if (nextHero != null && String(nextHero).trim()) {
      try {
        const u = new URL(String(nextHero).trim());
        if (u.protocol === 'https:') {
          images = [u.toString()];
        }
      } catch {
        /* skip invalid */
      }
    }

    try {
      await params.stripe.products.update(
        productId,
        {
          name: nextTitle,
          description: descForStripe,
          images,
        },
        { stripeAccount: connectId }
      );
    } catch (e) {
      console.error('Stripe product update (donation campaign):', e);
      const msg = e instanceof Error ? e.message : 'Stripe product update failed';
      return { ok: false, error: msg, httpStatus: 502 };
    }
  }

  const updates: Record<string, unknown> = {
    title: nextTitle,
    description: nextDescription,
    hero_image_url: nextHero,
    metadata,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updErr } = await params.supabase
    .from('donation_campaigns')
    .update(updates)
    .eq('id', params.campaignId)
    .eq('chapter_id', params.chapterId)
    .select('*')
    .single();

  if (updErr || !updated) {
    return {
      ok: false,
      error: updErr?.message || 'Failed to update campaign',
      httpStatus: 500,
    };
  }

  return { ok: true, campaign: updated as DonationCampaign };
}
