import type Stripe from 'stripe';

export type StripeWebhookHandleResult =
  | { ok: true; eventId: string; type: string; detail: string }
  | { ok: false; error: string };

/**
 * Stripe webhook event handler (initial scaffold).
 * Extend here to mirror Crowded flows: update `dues_assignments`, `donation_campaigns`, `payments_ledger`, etc.
 */
export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<StripeWebhookHandleResult> {
  try {
    switch (event.type) {
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
