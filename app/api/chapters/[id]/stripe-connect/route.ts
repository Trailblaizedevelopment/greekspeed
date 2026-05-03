import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/utils/urlUtils';
import { resolveStripeChapterConnectApiContext } from '@/lib/services/stripe/resolveStripeChapterConnectApiContext';
import {
  createStripeAccountOnboardingLink,
  createStripeExpressAccountIfMissing,
  loadChapterStripeConnectRow,
  requireStripeServer,
  syncStripeExpressAccountToChapter,
} from '@/lib/services/stripe/chapterStripeConnectService';

export const dynamic = 'force-dynamic';

function treasurerStripeConnectReturnPath(): string {
  const base = getBaseUrl().replace(/\/$/, '');
  return `${base}/dashboard/admin?view=dues`;
}

/**
 * Stripe Connect Express onboarding for chapter donations (TRA-684).
 * GET: status + refresh capability flags from Stripe when an account exists.
 * POST: ensure Express account exists and return Stripe-hosted onboarding URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chapterId } = await params;
    const ctx = await resolveStripeChapterConnectApiContext(request, chapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    const stripeRes = requireStripeServer();
    if (!stripeRes.ok) {
      return NextResponse.json({ error: stripeRes.error }, { status: stripeRes.httpStatus });
    }
    const { stripe } = stripeRes;

    const row = await loadChapterStripeConnectRow(ctx.supabase, chapterId);
    if (!row.ok) {
      return NextResponse.json({ error: row.error }, { status: 500 });
    }

    let detailsSubmitted = row.row.stripe_connect_details_submitted;
    let chargesEnabled = row.row.stripe_charges_enabled;
    const accountId = row.row.stripe_connect_account_id;

    if (accountId) {
      const sync = await syncStripeExpressAccountToChapter(ctx.supabase, stripe, chapterId, accountId);
      if (sync.ok) {
        detailsSubmitted = sync.row.stripe_connect_details_submitted;
        chargesEnabled = sync.row.stripe_charges_enabled;
      }
    }

    const needsOnboarding = Boolean(accountId) ? !chargesEnabled || !detailsSubmitted : true;

    return NextResponse.json({
      data: {
        stripeConnectAccountId: accountId,
        detailsSubmitted,
        chargesEnabled,
        needsOnboarding,
        hasAccount: Boolean(accountId),
      },
    });
  } catch (e) {
    console.error('GET /api/chapters/[id]/stripe-connect:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chapterId } = await params;
    const ctx = await resolveStripeChapterConnectApiContext(request, chapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    const stripeRes = requireStripeServer();
    if (!stripeRes.ok) {
      return NextResponse.json({ error: stripeRes.error }, { status: stripeRes.httpStatus });
    }
    const { stripe } = stripeRes;

    let country = process.env.STRIPE_CONNECT_DEFAULT_COUNTRY?.trim() || 'US';
    try {
      const body = await request.json().catch(() => ({}));
      if (body && typeof body === 'object' && typeof (body as { country?: unknown }).country === 'string') {
        const c = (body as { country: string }).country.trim().toUpperCase();
        if (c.length === 2) {
          country = c;
        }
      }
    } catch {
      /* empty body */
    }

    const created = await createStripeExpressAccountIfMissing({
      supabase: ctx.supabase,
      stripe,
      chapterId,
      country,
    });
    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: created.httpStatus });
    }

    const basePath = treasurerStripeConnectReturnPath();
    const refreshUrl = `${basePath}&stripe_connect=refresh`;
    const returnUrl = `${basePath}&stripe_connect=return`;

    const link = await createStripeAccountOnboardingLink({
      stripe,
      accountId: created.accountId,
      refreshUrl,
      returnUrl,
    });
    if (!link.ok) {
      return NextResponse.json({ error: link.error }, { status: link.httpStatus });
    }

    await syncStripeExpressAccountToChapter(ctx.supabase, stripe, chapterId, created.accountId).catch(() => {
      /* non-fatal */
    });

    return NextResponse.json({
      data: {
        url: link.url,
        accountId: created.accountId,
        accountCreated: created.created,
      },
    });
  } catch (e) {
    console.error('POST /api/chapters/[id]/stripe-connect:', e);
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
