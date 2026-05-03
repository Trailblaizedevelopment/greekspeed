/**
 * Chapter donation / Crowded collect campaigns (`public.donation_campaigns`).
 * API: `GET` / `POST` `/api/chapters/[id]/donations/campaigns`.
 * **POST** only accepts {@link DonationCampaignCreateKind}; `fixed` may still appear on rows created before that policy.
 * When Stripe Connect is ready for the chapter, **POST** creates Product + Price + Payment Link on the connected account (TRA-685); otherwise Crowded collection creation is used when Crowded is enabled.
 */

/** Stored row `kind` — may include legacy `fixed` from earlier releases. */
export type DonationCampaignKind = 'fixed' | 'open' | 'fundraiser';

/** Allowed `kind` on `POST …/donations/campaigns` (treasurer UI). */
export type DonationCampaignCreateKind = 'open' | 'fundraiser';

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
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}
