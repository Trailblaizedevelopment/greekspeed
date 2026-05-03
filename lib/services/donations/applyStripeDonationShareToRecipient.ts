import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * For Stripe-backed donations, copies the chapter Payment Link onto the recipient row (`stripe_checkout_url`).
 */
export async function applyStripeDonationShareToRecipient(params: {
  supabase: SupabaseClient;
  trailblaizeChapterId: string;
  donationCampaignId: string;
  donationCampaignRecipientId: string;
  paymentLinkUrl: string;
}): Promise<
  | { ok: true; paymentUrl: string; alreadySet: boolean }
  | { ok: false; error: string; httpStatus: number; code?: string }
> {
  const url = params.paymentLinkUrl.trim();
  if (!url) {
    return { ok: false, error: 'Missing payment link URL', httpStatus: 400, code: 'NO_LINK' };
  }

  const { data: recipient, error: recErr } = await params.supabase
    .from('donation_campaign_recipients')
    .select('id, donation_campaign_id, stripe_checkout_url')
    .eq('id', params.donationCampaignRecipientId)
    .maybeSingle();

  if (recErr || !recipient) {
    return { ok: false, error: 'Recipient not found', httpStatus: 404, code: 'NOT_FOUND' };
  }

  if ((recipient.donation_campaign_id as string) !== params.donationCampaignId) {
    return {
      ok: false,
      error: 'Recipient does not belong to this campaign',
      httpStatus: 404,
      code: 'NOT_FOUND',
    };
  }

  const existing = (recipient.stripe_checkout_url as string | null | undefined)?.trim();
  if (existing) {
    return { ok: true, paymentUrl: existing, alreadySet: true };
  }

  const { error: upErr } = await params.supabase
    .from('donation_campaign_recipients')
    .update({ stripe_checkout_url: url })
    .eq('id', params.donationCampaignRecipientId)
    .eq('donation_campaign_id', params.donationCampaignId);

  if (upErr) {
    return { ok: false, error: upErr.message || 'Failed to save checkout link', httpStatus: 500 };
  }

  return { ok: true, paymentUrl: url, alreadySet: false };
}
