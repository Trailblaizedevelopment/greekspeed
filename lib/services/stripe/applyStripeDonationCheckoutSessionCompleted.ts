import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { STRIPE_CHECKOUT_DONATION_PURPOSE } from '@/lib/services/donations/createStripeDonationRecipientCheckoutSession';

const PG_UNIQUE_VIOLATION = '23505';

export type ApplyStripeDonationCheckoutSessionCompletedResult =
  | { ok: true; detail: string }
  | { ok: false; error: string };

/**
 * Idempotent donation settlement for `checkout.session.completed` on Connect Checkout
 * (metadata from `createStripeDonationRecipientCheckoutSession`).
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

  const meta = session.metadata ?? {};
  const purpose = typeof meta.purpose === 'string' ? meta.purpose.trim() : '';
  if (purpose !== STRIPE_CHECKOUT_DONATION_PURPOSE) {
    return { ok: true, detail: `metadata purpose is not chapter donation (${purpose || 'empty'}); skipped` };
  }

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

  if (!chapterId || !campaignId || !recipientId || !profileId) {
    return { ok: true, detail: 'donation checkout missing required metadata; skipped' };
  }

  const currency = (session.currency ?? '').toLowerCase();
  if (currency !== 'usd') {
    return { ok: true, detail: `currency ${currency || 'empty'} not supported; skipped` };
  }

  const amountTotal = session.amount_total;
  if (amountTotal == null || !Number.isFinite(amountTotal) || amountTotal < 1) {
    return { ok: true, detail: 'missing or invalid amount_total; skipped' };
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
  const storedSessionId = (recipient.stripe_checkout_session_id as string | null | undefined)?.trim() ?? '';
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
