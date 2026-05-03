import type Stripe from 'stripe';
import { getBaseUrl } from '@/lib/utils/urlUtils';
import type { DonationCampaignCreateKind } from '@/types/donationCampaigns';

/** Minimum cents for Stripe `custom_unit_amount` open drives ($1.00). */
export const STRIPE_OPEN_DONATION_MIN_CENTS = 100;

export type CreateStripeDonationCampaignOnConnectParams = {
  stripe: Stripe;
  /** Stripe Connect Express account id (`acct_…`). */
  connectAccountId: string;
  trailblaizeChapterId: string;
  title: string;
  goalAmountCents: number;
  /** `open` → customer-chosen amount between min and goal (cap); `fundraiser` → fixed Price at goal. */
  kind: DonationCampaignCreateKind;
  /** Optional; Stripe Product `description` (Checkout / Payment Link polish). */
  description?: string | null;
  /** Public https URL; Stripe Product `images` (single entry when set). */
  heroImageUrl?: string | null;
};

/**
 * Creates Product + one-time Price + Payment Link on the **connected** account.
 * **Fundraiser:** fixed `unit_amount` = goal. **Open:** Price uses `custom_unit_amount` (min → goal as max).
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

  const goalCents = Math.round(params.goalAmountCents);
  if (params.kind === 'open' && goalCents <= STRIPE_OPEN_DONATION_MIN_CENTS) {
    return {
      ok: false,
      error: `Open amount drives need a goal greater than $${(STRIPE_OPEN_DONATION_MIN_CENTS / 100).toFixed(2)} so donors can choose an amount below the cap.`,
      httpStatus: 400,
    };
  }

  const accountOpts = { stripeAccount: connectAccountId } as const;
  const base = getBaseUrl().replace(/\/$/, '');

  const desc = params.description?.trim() || undefined;
  const heroTrim = params.heroImageUrl?.trim() || '';
  let productImages: string[] | undefined;
  if (heroTrim) {
    try {
      if (new URL(heroTrim).protocol === 'https:') {
        productImages = [heroTrim];
      }
    } catch {
      /* invalid URL — schema should block; skip images */
    }
  }

  let productId: string | null = null;
  try {
    const productCreate: Stripe.ProductCreateParams = {
      name: title,
      metadata: {
        trailblaize_chapter_id: params.trailblaizeChapterId,
      },
    };
    if (desc) {
      productCreate.description = desc;
    }
    if (productImages?.length) {
      productCreate.images = productImages;
    }

    const product = await stripe.products.create(productCreate, accountOpts);
    productId = product.id;

    const priceParams: Stripe.PriceCreateParams =
      params.kind === 'open'
        ? {
            product: product.id,
            currency: 'usd',
            custom_unit_amount: {
              enabled: true,
              minimum: STRIPE_OPEN_DONATION_MIN_CENTS,
              maximum: goalCents,
            },
            metadata: {
              trailblaize_chapter_id: params.trailblaizeChapterId,
              trailblaize_donation_kind: 'open',
            },
          }
        : {
            product: product.id,
            currency: 'usd',
            unit_amount: goalCents,
            metadata: {
              trailblaize_chapter_id: params.trailblaizeChapterId,
              trailblaize_donation_kind: 'fundraiser',
            },
          };

    const price = await stripe.prices.create(priceParams, accountOpts);

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
