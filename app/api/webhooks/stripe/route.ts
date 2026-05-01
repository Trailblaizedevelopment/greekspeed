import { NextRequest, NextResponse } from 'next/server';
import { handleStripeWebhookEvent } from '@/lib/services/stripe/handleStripeWebhookEvent';
import { getStripeServer } from '@/lib/services/stripe/stripeServerClient';

export const dynamic = 'force-dynamic';

/**
 * Stripe webhooks (dues/donations parity with Crowded — handler scaffold).
 * Point your Stripe Dashboard webhook endpoint to this URL and set `STRIPE_WEBHOOK_SECRET`.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripeServer();
  if (!stripe) {
    console.error('STRIPE_SECRET_KEY is not set');
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: import('stripe').Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid payload';
    console.error('Stripe webhook signature verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const result = await handleStripeWebhookEvent(event);
  if (!result.ok) {
    console.error('Stripe webhook handler error:', result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    received: true,
    id: result.eventId,
    type: result.type,
    detail: result.detail,
  });
}
