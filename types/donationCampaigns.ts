/**
 * Chapter donation / Crowded collect campaigns (`public.donation_campaigns`).
 * API: `GET` / `POST` `/api/chapters/[id]/donations/campaigns` — creates Crowded collections for
 * `fixed` | `open` | `fundraiser` (see `buildCrowdedDonationCollectionRequest`).
 */

export type DonationCampaignKind = 'fixed' | 'open' | 'fundraiser';

/** Row shape for public.donation_campaigns */
export interface DonationCampaign {
  id: string;
  chapter_id: string;
  title: string;
  kind: DonationCampaignKind;
  crowded_collection_id: string | null;
  goal_amount_cents: number | null;
  requested_amount_cents: number | null;
  crowded_share_url: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}
