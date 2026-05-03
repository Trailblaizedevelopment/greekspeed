import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

export type StripeWebhookHandleResult =
  | { ok: true; eventId: string; type: string; detail: string }
  | { ok: false; error: string };

export type HandleStripeWebhookOptions = {
  /** Service-role client for DB updates (e.g. Connect `account.updated`). */
  supabase?: SupabaseClient;
};

/**
 * Stripe webhook event handler (initial scaffold).
 * Extend here to mirror Crowded flows: update `dues_assignments`, `donation_campaigns`, `payments_ledger`, etc.
 */
export async function handleStripeWebhookEvent(
  event: Stripe.Event,
  options?: HandleStripeWebhookOptions
): Promise<StripeWebhookHandleResult> {
  try {
    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        const supabase = options?.supabase;
        if (!supabase) {
          return {
            ok: true,
            eventId: event.id,
            type: event.type,
            detail: 'account.updated (no supabase; skipped cache sync)',
          };
        }
        const { data, error } = await supabase
          .from('spaces')
          .update({
            stripe_connect_details_submitted: Boolean(account.details_submitted),
            stripe_charges_enabled: Boolean(account.charges_enabled),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_connect_account_id', account.id)
          .select('id');
        if (error) {
          return { ok: false, error: error.message };
        }
        if (!data?.length) {
          return {
            ok: true,
            eventId: event.id,
            type: event.type,
            detail: `account.updated: no space row matched stripe_connect_account_id=${account.id}`,
          };
        }
        return {
          ok: true,
          eventId: event.id,
          type: event.type,
          detail: `account.updated synced for ${account.id}`,
        };
      }
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const meta = session.metadata ?? {};
        const purpose = typeof meta.purpose === 'string' ? meta.purpose : 'unknown';
        return {
          ok: true,
          eventId: event.id,
          type: event.type,
          detail: `checkout.session.completed (purpose=${purpose}, session=${session.id})`,
        };
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        return {
          ok: true,
          eventId: event.id,
          type: event.type,
          detail: `payment_intent.succeeded (pi=${pi.id})`,
        };
      }
      default:
        return {
          ok: true,
          eventId: event.id,
          type: event.type,
          detail: `no-op handler for ${event.type}`,
        };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'handler error';
    return { ok: false, error: msg };
  }
}
