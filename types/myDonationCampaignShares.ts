import type { DonationCampaignKind } from '@/types/donationCampaigns';

export type DonationSharePaymentProvider = 'crowded' | 'stripe';

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
}
