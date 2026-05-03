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

async function deactivateStripeDonationArtifacts(params: {
  stripe: Stripe;
  connectAccountId: string;
  campaign: DonationCampaign;
}): Promise<void> {
  const { stripe, connectAccountId, campaign } = params;
  const accountOpts = { stripeAccount: connectAccountId } as const;
  const meta = asMetadataRecord(campaign.metadata);
  const paymentLinkId =
    typeof meta.stripe_payment_link_id === 'string' ? meta.stripe_payment_link_id.trim() : '';
  const productId = campaign.stripe_product_id?.trim() ?? '';

  if (paymentLinkId) {
    try {
      await stripe.paymentLinks.update(paymentLinkId, { active: false }, accountOpts);
    } catch (e) {
      console.warn('deleteDonationCampaign: payment link deactivate', e);
    }
  }

  if (productId) {
    try {
      await stripe.products.update(productId, { active: false }, accountOpts);
    } catch (e) {
      console.warn('deleteDonationCampaign: product archive', e);
    }
  }
}

/**
 * Deletes a Stripe-backed donation campaign row. Postgres CASCADE removes `donation_campaign_recipients` and
 * `donation_campaign_public_payments`. There is no `public.donations` ledger table on current Trailblaize prod; if
 * one is added later with RESTRICT FK, delete those rows here before deleting the campaign.
 * Best-effort Stripe deactivation so the Payment Link stops accepting new checkouts.
 */
export async function deleteDonationCampaign(params: {
  supabase: SupabaseClient;
  stripe: Stripe | null;
  stripeConnectAccountId: string | null;
  chapterId: string;
  campaignId: string;
}): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
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
    return { ok: false, error: 'This campaign cannot be deleted here', httpStatus: 400 };
  }

  const connectId = params.stripeConnectAccountId?.trim();
  if (connectId && params.stripe) {
    await deactivateStripeDonationArtifacts({
      stripe: params.stripe,
      connectAccountId: connectId,
      campaign,
    });
  }

  const { error: delErr } = await params.supabase
    .from('donation_campaigns')
    .delete()
    .eq('id', params.campaignId)
    .eq('chapter_id', params.chapterId);

  if (delErr) {
    console.error('deleteDonationCampaign campaign:', delErr);
    return { ok: false, error: delErr.message || 'Failed to delete campaign', httpStatus: 500 };
  }

  return { ok: true };
}
