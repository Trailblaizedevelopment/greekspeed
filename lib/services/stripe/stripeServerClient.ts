import Stripe from 'stripe';

let cached: Stripe | null | undefined;

/**
 * Server-side Stripe SDK (secret key). Lazily constructed.
 *
 * Env: `STRIPE_SECRET_KEY` — omit or leave empty to disable Stripe routes at runtime.
 */
export function getStripeServer(): Stripe | null {
  if (cached !== undefined) {
    return cached;
  }
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    cached = null;
    return null;
  }
  cached = new Stripe(key, {
    typescript: true,
    appInfo: {
      name: 'Trailblaize',
      url: 'https://trailblaize.net',
    },
  });
  return cached;
}
