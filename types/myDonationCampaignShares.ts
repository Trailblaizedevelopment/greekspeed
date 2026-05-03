import type { DonationCampaignKind } from '@/types/donationCampaigns';

export type DonationSharePaymentProvider = 'crowded' | 'stripe';

/** Chapter member who has a settled payment on this drive (from `donation_campaign_recipients`). */
export interface MyDonationCampaignContributor {
  profileId: string;
  displayName: string;
  amountPaidCents: number;
  paidAt: string | null;
  /** `public_guest` = Stripe Payment Link (chapter hub) checkout in `donation_campaign_public_payments`. */
  contributorSource?: 'recipient' | 'public_guest';
}

/**
 * Donation campaign shared with the current user (from `donation_campaign_recipients` + campaign row).
 */
export interface MyDonationCampaignShare {
  recipientId: string;
  sharedAt: string;
  campaignId: string;
  title: string;
  kind: DonationCampaignKind;
  /** Optional copy from `donation_campaigns.description`. */
  description?: string | null;
  /** Public https URL from `donation_campaigns.hero_image_url`. */
  heroImageUrl?: string | null;
  goalAmountCents: number | null;
  requestedAmountCents: number | null;
  /** Per-recipient Stripe Checkout URL or campaign Payment Link for Stripe-backed drives. */
  checkoutUrl: string | null;
  paymentProvider: DonationSharePaymentProvider;
  /**
   * @deprecated Prefer {@link checkoutUrl}. Still populated with the same resolved URL for backward compatibility.
   */
  crowdedShareUrl: string | null;
  crowdedCollectionId: string | null;
  /** This user's row: settled amount from webhooks (Stripe) or Crowded flows. */
  myAmountPaidCents: number | null;
  myPaidAt: string | null;
  /** Sum of `amount_paid_cents` across all recipients on this campaign (chapter-scoped). */
  campaignTotalRaisedCents: number;
  campaignSharedRecipientCount: number;
  campaignPaidRecipientCount: number;
  /** Members with recorded payments on this campaign, newest first. */
  contributors: MyDonationCampaignContributor[];
}
