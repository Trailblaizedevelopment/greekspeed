import type Stripe from 'stripe';
import { getBaseUrl } from '@/lib/utils/urlUtils';

export type CreateStripeDonationCampaignOnConnectParams = {
  stripe: Stripe;
  /** Stripe Connect Express account id (`acct_…`). */
  connectAccountId: string;
  trailblaizeChapterId: string;
  title: string;
  goalAmountCents: number;
};

/**
 * Creates Product + one-time Price + Payment Link on the **connected** account.
 * Returns ids and the public payment URL (stored on `donation_campaigns.crowded_share_url` for UI reuse).
 */
export async function createStripeDonationCampaignOnConnect(
  params: CreateStripeDonationCampaignOnConnectParams
): Promise<
  | {
      ok: true;
      stripeProductId: string;
      stripePriceId: string;
      paymentLinkUrl: string;
      stripePaymentLinkId: string;
    }
  | { ok: false; error: string; httpStatus: number }
> {
  const { stripe, connectAccountId } = params;
  const title = params.title.trim();
  if (!title) {
    return { ok: false, error: 'Title is required', httpStatus: 400 };
  }
  if (!Number.isFinite(params.goalAmountCents) || params.goalAmountCents < 1) {
    return { ok: false, error: 'goalAmountCents must be a positive integer', httpStatus: 400 };
  }

  const accountOpts = { stripeAccount: connectAccountId } as const;
  const base = getBaseUrl().replace(/\/$/, '');

  let productId: string | null = null;
  try {
    const product = await stripe.products.create(
      {
        name: title,
        metadata: {
          trailblaize_chapter_id: params.trailblaizeChapterId,
        },
      },
      accountOpts
    );
    productId = product.id;

    const price = await stripe.prices.create(
      {
        product: product.id,
        currency: 'usd',
        unit_amount: Math.round(params.goalAmountCents),
        metadata: {
          trailblaize_chapter_id: params.trailblaizeChapterId,
        },
      },
      accountOpts
    );

    const paymentLink = await stripe.paymentLinks.create(
      {
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: {
          trailblaize_chapter_id: params.trailblaizeChapterId,
        },
        after_completion: {
          type: 'redirect',
          redirect: { url: `${base}/dashboard?donationPaid=1` },
        },
      },
      accountOpts
    );

    const paymentLinkUrl = paymentLink.url?.trim();
    if (!paymentLinkUrl) {
      return { ok: false, error: 'Stripe did not return a payment link URL', httpStatus: 502 };
    }

    return {
      ok: true,
      stripeProductId: product.id,
      stripePriceId: price.id,
      paymentLinkUrl,
      stripePaymentLinkId: paymentLink.id,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Stripe request failed';
    if (productId) {
      try {
        await stripe.products.update(productId, { active: false }, accountOpts);
      } catch {
        /* best-effort */
      }
    }
    return { ok: false, error: msg, httpStatus: 502 };
  }
}
