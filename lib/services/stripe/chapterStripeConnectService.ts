import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getStripeServer } from '@/lib/services/stripe/stripeServerClient';

export interface ChapterStripeConnectRow {
  stripe_connect_account_id: string | null;
  stripe_connect_details_submitted: boolean;
  stripe_charges_enabled: boolean;
}

export async function loadChapterStripeConnectRow(
  supabase: SupabaseClient,
  chapterId: string
): Promise<{ ok: true; row: ChapterStripeConnectRow } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('spaces')
    .select('stripe_connect_account_id, stripe_connect_details_submitted, stripe_charges_enabled')
    .eq('id', chapterId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Chapter not found' };
  }

  return {
    ok: true,
    row: {
      stripe_connect_account_id: (data.stripe_connect_account_id as string | null)?.trim() || null,
      stripe_connect_details_submitted: Boolean(data.stripe_connect_details_submitted),
      stripe_charges_enabled: Boolean(data.stripe_charges_enabled),
    },
  };
}

export async function updateChapterStripeConnectCache(
  supabase: SupabaseClient,
  chapterId: string,
  fields: Partial<Pick<ChapterStripeConnectRow, 'stripe_connect_details_submitted' | 'stripe_charges_enabled'>>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('spaces')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', chapterId)
    .select('id');

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data?.length) {
    return { ok: false, error: 'No chapter row updated (check space id and permissions)' };
  }
  return { ok: true };
}

export async function syncStripeExpressAccountToChapter(
  supabase: SupabaseClient,
  stripe: Stripe,
  chapterId: string,
  accountId: string
): Promise<{ ok: true; row: ChapterStripeConnectRow } | { ok: false; error: string }> {
  const account = await stripe.accounts.retrieve(accountId);
  const detailsSubmitted = Boolean(account.details_submitted);
  const chargesEnabled = Boolean(account.charges_enabled);

  const up = await updateChapterStripeConnectCache(supabase, chapterId, {
    stripe_connect_details_submitted: detailsSubmitted,
    stripe_charges_enabled: chargesEnabled,
  });
  if (!up.ok) {
    return { ok: false, error: up.error };
  }

  const row = await loadChapterStripeConnectRow(supabase, chapterId);
  if (!row.ok) {
    return { ok: false, error: row.error };
  }
  return { ok: true, row: row.row };
}

export async function createStripeExpressAccountIfMissing(params: {
  supabase: SupabaseClient;
  stripe: Stripe;
  chapterId: string;
  country: string;
}): Promise<
  | { ok: true; accountId: string; created: boolean }
  | { ok: false; error: string; httpStatus: number }
> {
  const existing = await loadChapterStripeConnectRow(params.supabase, params.chapterId);
  if (!existing.ok) {
    return { ok: false, error: existing.error, httpStatus: 404 };
  }

  const current = existing.row.stripe_connect_account_id?.trim();
  if (current) {
    return { ok: true, accountId: current, created: false };
  }

  const account = await params.stripe.accounts.create({
    type: 'express',
    country: params.country,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      trailblaize_chapter_id: params.chapterId,
    },
  });

  const { data, error } = await params.supabase
    .from('spaces')
    .update({
      stripe_connect_account_id: account.id,
      stripe_connect_details_submitted: Boolean(account.details_submitted),
      stripe_charges_enabled: Boolean(account.charges_enabled),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.chapterId)
    .select('id');

  if (error) {
    return { ok: false, error: error.message || 'Failed to save Stripe account id', httpStatus: 500 };
  }
  if (!data?.length) {
    return {
      ok: false,
      error: 'Stripe account was created but could not be linked to this chapter (no row updated on spaces)',
      httpStatus: 500,
    };
  }

  return { ok: true, accountId: account.id, created: true };
}

export async function createStripeAccountOnboardingLink(params: {
  stripe: Stripe;
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string; httpStatus: number }> {
  const link = await params.stripe.accountLinks.create({
    account: params.accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: 'account_onboarding',
  });
  if (!link.url) {
    return { ok: false, error: 'Stripe did not return an onboarding URL', httpStatus: 502 };
  }
  return { ok: true, url: link.url };
}

export function requireStripeServer():
  | { ok: true; stripe: Stripe }
  | { ok: false; error: string; httpStatus: number } {
  const stripe = getStripeServer();
  if (!stripe) {
    return { ok: false, error: 'Stripe is not configured on the server', httpStatus: 503 };
  }
  return { ok: true, stripe };
}
