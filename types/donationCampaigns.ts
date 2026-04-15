/**
 * Chapter donation / Crowded collect campaigns (Phase 1 table: public.donation_campaigns).
 * Phase 2 will add API routes and Crowded create mapping.
 */

export type DonationCampaignKind = 'fixed' | 'fundraiser';

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
