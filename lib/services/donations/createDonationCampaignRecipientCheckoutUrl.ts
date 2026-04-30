import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrowdedClient } from '@/lib/services/crowded/crowded-client';
import { createCrowdedDuesPaymentIntent } from '@/lib/services/dues/crowdedDuesPaymentIntent';

/**
 * Creates a Crowded collect **intent** for one donation campaign recipient (mirrors dues checkout-link).
 * Persists `donation_campaign_recipients.crowded_checkout_url` when Crowded returns `paymentUrl`.
 */
export async function createDonationCampaignRecipientCheckoutUrl(params: {
  supabase: SupabaseClient;
  crowded: CrowdedClient;
  trailblaizeChapterId: string;
  crowdedChapterId: string;
  donationCampaignId: string;
  donationCampaignRecipientId: string;
  payerIp: string;
  successUrl: string;
  failureUrl: string;
}): Promise<
  | { ok: true; paymentUrl: string; alreadySet: boolean }
  | { ok: false; error: string; code?: string; httpStatus: number }
> {
  const { data: recipient, error: recErr } = await params.supabase
    .from('donation_campaign_recipients')
    .select('id, donation_campaign_id, profile_id, crowded_contact_id, crowded_checkout_url')
    .eq('id', params.donationCampaignRecipientId)
    .maybeSingle();

  if (recErr || !recipient) {
    return { ok: false, error: 'Recipient not found', httpStatus: 404, code: 'NOT_FOUND' };
  }

  if ((recipient.donation_campaign_id as string) !== params.donationCampaignId) {
    return {
      ok: false,
      error: 'Recipient does not belong to this campaign',
      httpStatus: 404,
      code: 'NOT_FOUND',
    };
  }

  const existingCheckout = (recipient.crowded_checkout_url as string | null | undefined)?.trim();
  if (existingCheckout) {
    return { ok: true, paymentUrl: existingCheckout, alreadySet: true };
  }

  const { data: campaign, error: campErr } = await params.supabase
    .from('donation_campaigns')
    .select('id, chapter_id, crowded_collection_id, goal_amount_cents')
    .eq('id', params.donationCampaignId)
    .eq('chapter_id', params.trailblaizeChapterId)
    .maybeSingle();

  if (campErr || !campaign) {
    return { ok: false, error: 'Donation campaign not found', httpStatus: 404, code: 'NOT_FOUND' };
  }

  const collectionId = (campaign.crowded_collection_id as string | null)?.trim();
  if (!collectionId) {
    return {
      ok: false,
      error: 'This campaign has no Crowded collection id.',
      httpStatus: 400,
      code: 'NO_COLLECTION',
    };
  }

  const goalCents = campaign.goal_amount_cents;
  const requestedAmountMinor =
    typeof goalCents === 'number' && Number.isFinite(goalCents) && goalCents > 0
      ? Math.round(goalCents)
      : null;
  if (requestedAmountMinor == null) {
    return {
      ok: false,
      error: 'Campaign needs a positive goal amount before generating a Crowded checkout link.',
      httpStatus: 400,
      code: 'NO_GOAL_AMOUNT',
    };
  }

  const profileId = recipient.profile_id as string;
  const { data: memberProfile, error: profErr } = await params.supabase
    .from('profiles')
    .select('id, email, first_name, last_name, full_name')
    .eq('id', profileId)
    .maybeSingle();

  if (profErr || !memberProfile) {
    return { ok: false, error: 'Member profile not found', httpStatus: 404, code: 'NOT_FOUND' };
  }

  const contactsResponse = await params.crowded.listContacts(params.crowdedChapterId);

  const memberProfilePayload = {
    email: memberProfile.email as string | null,
    first_name: memberProfile.first_name as string | null,
    last_name: memberProfile.last_name as string | null,
    full_name: memberProfile.full_name as string | null,
  };

  const noProfileEmailMessage =
    'This member has no email on their profile. Add an email before generating a Crowded checkout link.';

  const payIntent = await createCrowdedDuesPaymentIntent({
    crowded: params.crowded,
    crowdedChapterId: params.crowdedChapterId,
    crowdedCollectionId: collectionId,
    contacts: contactsResponse.data,
    memberProfile: memberProfilePayload,
    requestedAmountMinor,
    payerIp: params.payerIp,
    successUrl: params.successUrl,
    failureUrl: params.failureUrl,
    noProfileEmailMessage,
  });

  if (!payIntent.ok) {
    return {
      ok: false,
      error: payIntent.error,
      code: payIntent.code,
      httpStatus: payIntent.httpStatus,
    };
  }

  const { error: upErr } = await params.supabase
    .from('donation_campaign_recipients')
    .update({ crowded_checkout_url: payIntent.paymentUrl })
    .eq('id', params.donationCampaignRecipientId)
    .eq('donation_campaign_id', params.donationCampaignId);

  if (upErr) {
    return {
      ok: false,
      error:
        upErr.message?.includes('crowded_checkout_url') || upErr.message?.includes('column')
          ? 'Database is missing column crowded_checkout_url — run the latest Supabase migration, then retry.'
          : upErr.message || 'Failed to save checkout URL',
      httpStatus: 500,
      code: 'UPDATE_FAILED',
    };
  }

  return { ok: true, paymentUrl: payIntent.paymentUrl, alreadySet: false };
}
