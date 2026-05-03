import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createStripeDonationRecipientCheckoutSession } from '@/lib/services/donations/createStripeDonationRecipientCheckoutSession';
import { resolveDonationCampaignsApiContext } from '@/lib/services/donations/resolveDonationCampaignsApiContext';
import { getBaseUrl } from '@/lib/utils/urlUtils';
import { isDonationCampaignStripeDrive } from '@/types/donationCampaigns';
import { getStripeServer } from '@/lib/services/stripe/stripeServerClient';

const patchBodySchema = z.object({
  donationCampaignRecipientId: z.string().uuid().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> }
) {
  try {
    const { id: trailblaizeChapterId, campaignId } = await params;
    const ctx = await resolveDonationCampaignsApiContext(request, trailblaizeChapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    let bodyJson: unknown = {};
    try {
      const text = await request.text();
      if (text.trim()) {
        bodyJson = JSON.parse(text) as unknown;
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsedBody = patchBodySchema.safeParse(bodyJson);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const donationCampaignRecipientId = parsedBody.data.donationCampaignRecipientId?.trim();

    const { data: campaign, error: campErr } = await ctx.supabase
      .from('donation_campaigns')
      .select('id, chapter_id, crowded_collection_id, crowded_share_url, stripe_price_id')
      .eq('id', campaignId)
      .eq('chapter_id', trailblaizeChapterId)
      .maybeSingle();

    if (campErr || !campaign) {
      return NextResponse.json({ error: 'Donation campaign not found' }, { status: 404 });
    }

    if (!isDonationCampaignStripeDrive(campaign)) {
      return NextResponse.json(
        {
          error:
            'This donation is not Stripe-backed. Legacy Crowded-backed donations are no longer supported.',
          code: 'LEGACY_CAMPAIGN',
        },
        { status: 410 }
      );
    }

    const paymentUrl = (campaign.crowded_share_url as string | null)?.trim();

    if (donationCampaignRecipientId) {
      const stripe = getStripeServer();
      if (!stripe) {
        return NextResponse.json({ error: 'Stripe is not configured on the server' }, { status: 503 });
      }
      const connectId = ctx.stripeConnectAccountId?.trim();
      if (!connectId) {
        return NextResponse.json(
          { error: 'Chapter has no Stripe Connect account — complete Connect onboarding first.' },
          { status: 400 }
        );
      }

      const baseUrl = getBaseUrl().replace(/\/$/, '');
      const successUrl = `${baseUrl}/dashboard?donationPaid=1&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${baseUrl}/dashboard?donationCanceled=1`;

      const sessionRes = await createStripeDonationRecipientCheckoutSession({
        supabase: ctx.supabase,
        stripe,
        connectAccountId: connectId,
        trailblaizeChapterId,
        donationCampaignId: campaignId,
        donationCampaignRecipientId,
        successUrl,
        cancelUrl,
      });
      if (!sessionRes.ok) {
        return NextResponse.json(
          { error: sessionRes.error, code: sessionRes.code },
          { status: sessionRes.httpStatus >= 400 && sessionRes.httpStatus < 600 ? sessionRes.httpStatus : 502 }
        );
      }
      return NextResponse.json({
        data: {
          crowdedShareUrl: sessionRes.paymentUrl,
          alreadySet: sessionRes.alreadySet,
          source: 'stripe_checkout' as const,
        },
      });
    }

    if (!paymentUrl) {
      return NextResponse.json(
        { error: 'This Stripe donation is missing its payment link — recreate the donation or contact support.' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      data: {
        crowdedShareUrl: paymentUrl,
        alreadySet: true,
        source: 'collection' as const,
      },
    });
  } catch (e) {
    console.error('PATCH donation share-link:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
