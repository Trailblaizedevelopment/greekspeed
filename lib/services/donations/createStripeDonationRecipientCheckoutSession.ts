import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { isDonationCampaignStripeDrive } from '@/types/donationCampaigns';

/** Session + PaymentIntent metadata `purpose` value for chapter donation Checkout (webhook TRA-689). */
export const STRIPE_CHECKOUT_DONATION_PURPOSE = 'trailblaize_chapter_donation';

/** Checkout from campaign Stripe Payment Link (chapter hub / public); no recipient row. */
export const STRIPE_DONATION_SETTLEMENT_PAYMENT_LINK_PUBLIC = 'payment_link_public';

/**
 * Creates a Stripe Checkout Session on the **connected** account (same model as TRA-685 Payment Links:
 * charges settle on the chapter Express account). Persists `stripe_checkout_url` and `stripe_checkout_session_id`
 * on `donation_campaign_recipients` for webhook reconciliation (TRA-689).
 */
export async function createStripeDonationRecipientCheckoutSession(params: {
  supabase: SupabaseClient;
  stripe: Stripe;
  connectAccountId: string;
  trailblaizeChapterId: string;
  donationCampaignId: string;
  donationCampaignRecipientId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<
  | { ok: true; paymentUrl: string; alreadySet: boolean }
  | { ok: false; error: string; httpStatus: number; code?: string }
> {
  const connectId = params.connectAccountId.trim();
  if (!connectId) {
    return { ok: false, error: 'Chapter Stripe Connect account is missing', httpStatus: 400, code: 'NO_CONNECT' };
  }

  const { data: recipient, error: recErr } = await params.supabase
    .from('donation_campaign_recipients')
    .select('id, donation_campaign_id, profile_id, stripe_checkout_url, stripe_checkout_session_id')
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

  const existingUrl = (recipient.stripe_checkout_url as string | null | undefined)?.trim();
  if (existingUrl) {
    return { ok: true, paymentUrl: existingUrl, alreadySet: true };
  }

  const { data: campaign, error: campErr } = await params.supabase
    .from('donation_campaigns')
    .select('id, chapter_id, stripe_price_id, crowded_collection_id')
    .eq('id', params.donationCampaignId)
    .eq('chapter_id', params.trailblaizeChapterId)
    .maybeSingle();

  if (campErr || !campaign) {
    return { ok: false, error: 'Donation campaign not found', httpStatus: 404, code: 'NOT_FOUND' };
  }

  const priceId = (campaign.stripe_price_id as string | null)?.trim();
  if (!isDonationCampaignStripeDrive(campaign) || !priceId) {
    return {
      ok: false,
      error: 'This campaign is not a Stripe-backed drive or is missing stripe_price_id',
      httpStatus: 400,
      code: 'NO_STRIPE_PRICE',
    };
  }

  const profileId = recipient.profile_id as string;

  const successWithSession = params.successUrl.includes('{CHECKOUT_SESSION_ID}')
    ? params.successUrl
    : `${params.successUrl}${params.successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`;

  const accountOpts = { stripeAccount: connectId } as const;

  try {
    const session = await params.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successWithSession,
        cancel_url: params.cancelUrl,
        metadata: {
          purpose: STRIPE_CHECKOUT_DONATION_PURPOSE,
          trailblaize_chapter_id: params.trailblaizeChapterId,
          trailblaize_donation_campaign_id: params.donationCampaignId,
          trailblaize_donation_recipient_id: params.donationCampaignRecipientId,
          trailblaize_profile_id: profileId,
        },
        payment_intent_data: {
          metadata: {
            purpose: STRIPE_CHECKOUT_DONATION_PURPOSE,
            trailblaize_chapter_id: params.trailblaizeChapterId,
            trailblaize_donation_campaign_id: params.donationCampaignId,
            trailblaize_donation_recipient_id: params.donationCampaignRecipientId,
            trailblaize_profile_id: profileId,
          },
        },
      },
      accountOpts
    );

    const url = session.url?.trim();
    if (!url) {
      return { ok: false, error: 'Stripe did not return a checkout URL', httpStatus: 502, code: 'NO_URL' };
    }

    const { error: upErr } = await params.supabase
      .from('donation_campaign_recipients')
      .update({
        stripe_checkout_url: url,
        stripe_checkout_session_id: session.id,
      })
      .eq('id', params.donationCampaignRecipientId)
      .eq('donation_campaign_id', params.donationCampaignId);

    if (upErr) {
      return {
        ok: false,
        error:
          upErr.message?.includes('stripe_checkout') || upErr.message?.includes('column')
            ? 'Database is missing Stripe checkout columns — run the latest Supabase migration, then retry.'
            : upErr.message || 'Failed to save checkout session',
        httpStatus: 500,
        code: 'UPDATE_FAILED',
      };
    }

    return { ok: true, paymentUrl: url, alreadySet: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Stripe checkout create failed';
    return { ok: false, error: msg, httpStatus: 502, code: 'STRIPE_ERROR' };
  }
}
