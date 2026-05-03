/**
 * Chapter donations (`public.donation_campaigns`), paid via Stripe Connect.
 * API: `GET` / `POST` `/api/chapters/[id]/donations/campaigns`.
 * **POST** only accepts {@link DonationCampaignCreateKind}; `fixed` may still appear on rows created before that policy.
 * **POST** creates Product + Price + Payment Link on the connected account: **fundraiser** = fixed `unit_amount`; **open** = `custom_unit_amount` (donor min–goal cap).
 */

/** Stored row `kind` — may include legacy `fixed` from earlier releases. */
export type DonationCampaignKind = 'fixed' | 'open' | 'fundraiser';

/** Allowed `kind` on `POST …/donations/campaigns` (treasurer UI). */
export type DonationCampaignCreateKind = 'open' | 'fundraiser';

/** True when the campaign is paid via Stripe Checkout on Connect (no legacy Crowded collection id). */
export function isDonationCampaignStripeDrive(campaign: {
  stripe_price_id?: string | null;
  crowded_collection_id?: string | null;
}): boolean {
  return Boolean(campaign.stripe_price_id?.trim()) && !campaign.crowded_collection_id?.trim();
}

/** Row shape for public.donation_campaigns */
export interface DonationCampaign {
  id: string;
  chapter_id: string;
  title: string;
  kind: DonationCampaignKind;
  crowded_collection_id: string | null;
  /** Stripe Product on the chapter connected account (Stripe-backed campaigns). */
  stripe_product_id?: string | null;
  /** Stripe Price for Checkout line items (Stripe-backed campaigns). */
  stripe_price_id?: string | null;
  goal_amount_cents: number | null;
  requested_amount_cents: number | null;
  crowded_share_url: string | null;
  /** Optional longer copy for UI; also used for Stripe Product.description when applicable. */
  description?: string | null;
  /** Public https URL for hero art; Stripe Product.images when applicable. */
  hero_image_url?: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}
