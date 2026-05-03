import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  STRIPE_CHECKOUT_DONATION_PURPOSE,
  STRIPE_DONATION_SETTLEMENT_PAYMENT_LINK_PUBLIC,
} from '@/lib/services/donations/createStripeDonationRecipientCheckoutSession';
import { isDonationCampaignStripeDrive } from '@/types/donationCampaigns';

const PG_UNIQUE_VIOLATION = '23505';

export type ApplyStripeDonationCheckoutSessionCompletedResult =
  | { ok: true; detail: string }
  | { ok: false; error: string };

function paymentLinkIdFromSession(session: Stripe.Checkout.Session): string | null {
  const pl = session.payment_link;
  if (typeof pl === 'string' && pl.trim()) return pl.trim();
  if (pl && typeof pl === 'object' && 'id' in pl && typeof (pl as { id?: string }).id === 'string') {
    return (pl as { id: string }).id.trim();
  }
  return null;
}

async function resolveStripePublicCampaignFromPaymentLink(params: {
  supabase: SupabaseClient;
  paymentLinkId: string;
}): Promise<{ campaignId: string; chapterId: string } | null> {
  const { data, error } = await params.supabase
    .from('donation_campaigns')
    .select('id, chapter_id, stripe_price_id, crowded_collection_id')
    .contains('metadata', { stripe_payment_link_id: params.paymentLinkId })
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const stripeDrive = isDonationCampaignStripeDrive({
    stripe_price_id: data.stripe_price_id as string | null | undefined,
    crowded_collection_id: data.crowded_collection_id as string | null | undefined,
  });
  if (!stripeDrive) {
    return null;
  }

  return {
    campaignId: data.id as string,
    chapterId: data.chapter_id as string,
  };
}

/**
 * Idempotent donation settlement for `checkout.session.completed` on Connect:
 * - Per-recipient Checkout (metadata includes recipient + profile).
 * - Campaign Payment Link / public hub (metadata or legacy `payment_link` id match).
 */
export async function applyStripeDonationCheckoutSessionCompleted(params: {
  supabase: SupabaseClient;
  event: Stripe.Event;
}): Promise<ApplyStripeDonationCheckoutSessionCompletedResult> {
  if (params.event.type !== 'checkout.session.completed') {
    return { ok: true, detail: 'not checkout.session.completed' };
  }

  const session = params.event.data.object as Stripe.Checkout.Session;
  if (session.mode !== 'payment') {
    return { ok: true, detail: 'checkout session mode is not payment; skipped' };
  }
  if (session.payment_status !== 'paid') {
    return {
      ok: true,
      detail: `checkout session payment_status=${session.payment_status ?? 'unknown'}; skipped`,
    };
  }

  const currency = (session.currency ?? '').toLowerCase();
  if (currency !== 'usd') {
    return { ok: true, detail: `currency ${currency || 'empty'} not supported; skipped` };
  }

  const amountTotal = session.amount_total;
  if (amountTotal == null || !Number.isFinite(amountTotal) || amountTotal < 1) {
    return { ok: true, detail: 'missing or invalid amount_total; skipped' };
  }

  const meta = session.metadata ?? {};
  const purpose = typeof meta.purpose === 'string' ? meta.purpose.trim() : '';
  const settlement =
    typeof meta.trailblaize_donation_settlement === 'string'
      ? meta.trailblaize_donation_settlement.trim()
      : '';

  const chapterId =
    typeof meta.trailblaize_chapter_id === 'string' ? meta.trailblaize_chapter_id.trim() : '';
  const campaignId =
    typeof meta.trailblaize_donation_campaign_id === 'string'
      ? meta.trailblaize_donation_campaign_id.trim()
      : '';
  const recipientId =
    typeof meta.trailblaize_donation_recipient_id === 'string'
      ? meta.trailblaize_donation_recipient_id.trim()
      : '';
  const profileId =
    typeof meta.trailblaize_profile_id === 'string' ? meta.trailblaize_profile_id.trim() : '';

  const isRecipientSettlement =
    purpose === STRIPE_CHECKOUT_DONATION_PURPOSE &&
    Boolean(chapterId && campaignId && recipientId && profileId);

  const isPublicSettlement =
    purpose === STRIPE_CHECKOUT_DONATION_PURPOSE &&
    settlement === STRIPE_DONATION_SETTLEMENT_PAYMENT_LINK_PUBLIC &&
    Boolean(chapterId && campaignId) &&
    !recipientId &&
    !profileId;

  let resolvedPublic: { campaignId: string; chapterId: string } | null = null;
  if (!isRecipientSettlement && !isPublicSettlement) {
    if (purpose && purpose !== STRIPE_CHECKOUT_DONATION_PURPOSE) {
      return { ok: true, detail: `metadata purpose is not chapter donation (${purpose}); skipped` };
    }
    const plId = paymentLinkIdFromSession(session);
    if (plId) {
      resolvedPublic = await resolveStripePublicCampaignFromPaymentLink({
        supabase: params.supabase,
        paymentLinkId: plId,
      });
    }
    if (!resolvedPublic) {
      return {
        ok: true,
        detail: 'not a recognized Trailblaize donation checkout (recipient or public payment link); skipped',
      };
    }
  }

  const receivedAt = new Date(params.event.created * 1000).toISOString();

  const { data: insertedRows, error: insErr } = await params.supabase
    .from('stripe_webhook_events')
    .insert({
      stripe_event_id: params.event.id,
      event_type: params.event.type,
      received_at: receivedAt,
    })
    .select('id');

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    if (code === PG_UNIQUE_VIOLATION || insErr.message?.toLowerCase().includes('duplicate')) {
      return { ok: true, detail: `duplicate stripe_event_id=${params.event.id} (idempotent no-op)` };
    }
    return { ok: false, error: insErr.message };
  }

  const evtId = insertedRows?.[0]?.id as string | undefined;
  if (!evtId) {
    return { ok: false, error: 'stripe_webhook_events insert did not return id' };
  }

  const rollbackIdempotency = async () => {
    await params.supabase.from('stripe_webhook_events').delete().eq('id', evtId);
  };

  if (isRecipientSettlement) {
    const { data: campaign, error: campErr } = await params.supabase
      .from('donation_campaigns')
      .select('id, chapter_id')
      .eq('id', campaignId)
      .eq('chapter_id', chapterId)
      .maybeSingle();

    if (campErr || !campaign) {
      await rollbackIdempotency();
      return { ok: false, error: 'donation campaign not found for metadata chapter/campaign' };
    }

    const { data: recipient, error: recErr } = await params.supabase
      .from('donation_campaign_recipients')
      .select('id, profile_id, amount_paid_cents, stripe_checkout_session_id')
      .eq('id', recipientId)
      .eq('donation_campaign_id', campaignId)
      .maybeSingle();

    if (recErr || !recipient) {
      await rollbackIdempotency();
      return { ok: false, error: 'donation_campaign_recipients row not found' };
    }
    if ((recipient.profile_id as string) !== profileId) {
      await rollbackIdempotency();
      return { ok: false, error: 'recipient profile_id does not match metadata' };
    }

    const sessionId = typeof session.id === 'string' ? session.id.trim() : '';
    const storedSessionId =
      (recipient.stripe_checkout_session_id as string | null | undefined)?.trim() ?? '';
    if (sessionId && storedSessionId && sessionId !== storedSessionId) {
      await rollbackIdempotency();
      return {
        ok: false,
        error: 'checkout session id does not match recipient stripe_checkout_session_id',
      };
    }

    const prior = recipient.amount_paid_cents as number | null | undefined;
    const priorNum = typeof prior === 'number' && Number.isFinite(prior) ? Math.max(0, prior) : 0;
    const newPaid = priorNum + amountTotal;

    const { error: upErr } = await params.supabase
      .from('donation_campaign_recipients')
      .update({
        amount_paid_cents: newPaid,
        paid_at: receivedAt,
      })
      .eq('id', recipientId)
      .eq('donation_campaign_id', campaignId);

    if (upErr) {
      await rollbackIdempotency();
      return { ok: false, error: upErr.message };
    }

    return {
      ok: true,
      detail: `donation recipient ${recipientId} credited ${amountTotal} cents (session ${session.id})`,
    };
  }

  const pubChapterId = isPublicSettlement ? chapterId : resolvedPublic!.chapterId;
  const pubCampaignId = isPublicSettlement ? campaignId : resolvedPublic!.campaignId;

  const { data: pubCampaign, error: pubCampErr } = await params.supabase
    .from('donation_campaigns')
    .select('id, chapter_id')
    .eq('id', pubCampaignId)
    .eq('chapter_id', pubChapterId)
    .maybeSingle();

  if (pubCampErr || !pubCampaign) {
    await rollbackIdempotency();
    return { ok: false, error: 'donation campaign not found for public payment settlement' };
  }

  const sessionId = typeof session.id === 'string' ? session.id.trim() : '';
  if (!sessionId) {
    await rollbackIdempotency();
    return { ok: false, error: 'checkout session id missing' };
  }

  const payerRaw =
    (session.customer_details &&
      typeof session.customer_details === 'object' &&
      session.customer_details !== null &&
      'email' in session.customer_details &&
      typeof (session.customer_details as { email?: string }).email === 'string' &&
      (session.customer_details as { email: string }).email) ||
    (typeof session.customer_email === 'string' ? session.customer_email : null);
  const payerEmail = payerRaw?.trim() ? payerRaw.trim() : null;

  const { error: pubInsErr } = await params.supabase.from('donation_campaign_public_payments').insert({
    donation_campaign_id: pubCampaignId,
    stripe_checkout_session_id: sessionId,
    amount_paid_cents: amountTotal,
    paid_at: receivedAt,
    payer_email: payerEmail,
  });

  if (pubInsErr) {
    const code = (pubInsErr as { code?: string }).code;
    if (code === PG_UNIQUE_VIOLATION || pubInsErr.message?.toLowerCase().includes('duplicate')) {
      return {
        ok: true,
        detail: `public donation session ${sessionId} already recorded (idempotent)`,
      };
    }
    await rollbackIdempotency();
    return { ok: false, error: pubInsErr.message };
  }

  return {
    ok: true,
    detail: `public donation campaign ${pubCampaignId} credited ${amountTotal} cents (session ${session.id})`,
  };
}
