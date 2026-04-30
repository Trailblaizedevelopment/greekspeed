import type { DonationCampaignKind } from '@/types/donationCampaigns';

/**
 * Donation campaign shared with the current user (from `donation_campaign_recipients` + campaign row).
 */
export interface MyDonationCampaignShare {
  recipientId: string;
  sharedAt: string;
  campaignId: string;
  title: string;
  kind: DonationCampaignKind;
  goalAmountCents: number | null;
  requestedAmountCents: number | null;
  crowdedShareUrl: string | null;
  crowdedCollectionId: string | null;
}
