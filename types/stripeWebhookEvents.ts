/**
 * `public.stripe_webhook_events` — idempotency for Stripe webhook processing (TRA-683).
 * Written by server-side webhook handler using service role only.
 */
export interface StripeWebhookEventRow {
  id: string;
  stripe_event_id: string;
  event_type: string;
  received_at: string;
}
