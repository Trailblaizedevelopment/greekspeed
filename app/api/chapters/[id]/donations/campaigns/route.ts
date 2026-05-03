import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateCrowdedApiRequest } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { createStripeDonationCampaignOnConnect } from '@/lib/services/donations/createStripeDonationCampaignOnConnect';
import { donationCampaignPostBodySchema } from '@/lib/services/donations/donationCampaignSchemas';
import { resolveDonationCampaignsApiContext } from '@/lib/services/donations/resolveDonationCampaignsApiContext';
import { getStripeServer } from '@/lib/services/stripe/stripeServerClient';
import type { DonationCampaign } from '@/types/donationCampaigns';
import { isDonationCampaignStripeDrive } from '@/types/donationCampaigns';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trailblaizeChapterId } = await params;

    const ctx = await resolveDonationCampaignsApiContext(request, trailblaizeChapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    const { data: rows, error } = await ctx.supabase
      .from('donation_campaigns')
      .select('*')
      .eq('chapter_id', trailblaizeChapterId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('donation_campaigns list error:', error);
      return NextResponse.json({ error: 'Failed to list campaigns' }, { status: 500 });
    }

    const list = (rows ?? []) as DonationCampaign[];
    const filtered = list.filter(isDonationCampaignStripeDrive);

    return NextResponse.json({ data: filtered });
  } catch (e) {
    console.error('GET donation campaigns:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trailblaizeChapterId } = await params;

    const auth = await authenticateCrowdedApiRequest(request);
    if (!auth?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const creatorId = auth.user.id;

    const ctx = await resolveDonationCampaignsApiContext(request, trailblaizeChapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = donationCampaignPostBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const descriptionStored = body.description?.trim() || null;
    const heroImageUrlStored = body.heroImageUrl?.trim() || null;

    const stripe = getStripeServer();
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured on the server' }, { status: 503 });
    }
    const connectId = ctx.stripeConnectAccountId;
    if (!connectId) {
      return NextResponse.json(
        { error: 'Chapter has no Stripe Connect account — complete Connect onboarding first.' },
        { status: 400 }
      );
    }

    const donationCampaignId = randomUUID();
    const stripeRes = await createStripeDonationCampaignOnConnect({
      stripe,
      connectAccountId: connectId,
      donationCampaignId,
      trailblaizeChapterId,
      title: body.title,
      goalAmountCents: body.goalAmountCents,
      kind: body.kind,
      description: descriptionStored,
      heroImageUrl: heroImageUrlStored,
    });
    if (!stripeRes.ok) {
      return NextResponse.json({ error: stripeRes.error }, { status: stripeRes.httpStatus });
    }

    const insertRow = {
      id: donationCampaignId,
      chapter_id: trailblaizeChapterId,
      title: body.title.trim(),
      kind: body.kind,
      crowded_collection_id: null,
      goal_amount_cents: body.goalAmountCents,
      requested_amount_cents: null,
      description: descriptionStored,
      hero_image_url: heroImageUrlStored,
      crowded_share_url: stripeRes.paymentLinkUrl,
      stripe_product_id: stripeRes.stripeProductId,
      stripe_price_id: stripeRes.stripePriceId,
      metadata: ({
        ...(body.metadata ?? {}),
        payment_provider: 'stripe',
        stripe_payment_link_id: stripeRes.stripePaymentLinkId,
        chapter_hub_visible: false,
        ...(body.kind === 'fundraiser' && body.showOnPublicFundraisingChannels !== undefined
          ? { showOnPublicFundraisingChannels: body.showOnPublicFundraisingChannels }
          : {}),
      }) as Record<string, unknown>,
      created_by: creatorId,
    };

    const { data: row, error: insertErr } = await ctx.supabase
      .from('donation_campaigns')
      .insert(insertRow)
      .select('*')
      .single();

    if (insertErr) {
      console.error('donation_campaigns insert error (Stripe):', insertErr);
      return NextResponse.json(
        { error: 'Failed to save campaign after Stripe create', details: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: row as DonationCampaign }, { status: 201 });
  } catch (error) {
    console.error('POST donation campaigns:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
