import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { createStripeDonationRecipientCheckoutSession } from '@/lib/services/donations/createStripeDonationRecipientCheckoutSession';

export type EnsureStripeCheckoutSessionsResult = {
  created: number;
  skippedAlreadySet: number;
  failures: Array<{ recipientId: string; error: string }>;
};

/**
 * Ensures each recipient row has a Stripe Checkout session URL (idempotent per row).
 * Call after inserting/updating `donation_campaign_recipients` for a Stripe-backed donation.
 */
export async function ensureStripeCheckoutSessionsForRecipientIds(params: {
  supabase: SupabaseClient;
  stripe: Stripe;
  connectAccountId: string;
  trailblaizeChapterId: string;
  donationCampaignId: string;
  recipientIds: string[];
  successUrl: string;
  cancelUrl: string;
}): Promise<EnsureStripeCheckoutSessionsResult> {
  const uniqueIds = [...new Set(params.recipientIds.map((id) => id.trim()).filter(Boolean))];
  let created = 0;
  let skippedAlreadySet = 0;
  const failures: Array<{ recipientId: string; error: string }> = [];

  for (const donationCampaignRecipientId of uniqueIds) {
    const res = await createStripeDonationRecipientCheckoutSession({
      supabase: params.supabase,
      stripe: params.stripe,
      connectAccountId: params.connectAccountId,
      trailblaizeChapterId: params.trailblaizeChapterId,
      donationCampaignId: params.donationCampaignId,
      donationCampaignRecipientId,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    });

    if (!res.ok) {
      failures.push({ recipientId: donationCampaignRecipientId, error: res.error });
      continue;
    }
    if (res.alreadySet) {
      skippedAlreadySet += 1;
    } else {
      created += 1;
    }
  }

  return { created, skippedAlreadySet, failures };
}
