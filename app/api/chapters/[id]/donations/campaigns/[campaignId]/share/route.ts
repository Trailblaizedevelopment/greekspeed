import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createCrowdedClientFromEnv, CrowdedApiError } from '@/lib/services/crowded/crowded-client';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import {
  addDonationCampaignRecipients,
  addDonationCampaignRecipientsForStripeCampaign,
} from '@/lib/services/donations/donationCampaignShareService';
import { ensureStripeCheckoutSessionsForRecipientIds } from '@/lib/services/donations/ensureStripeCheckoutSessionsForRecipientIds';
import { resolveDonationCampaignsApiContext } from '@/lib/services/donations/resolveDonationCampaignsApiContext';
import { getBaseUrl } from '@/lib/utils/urlUtils';
import { getStripeServer } from '@/lib/services/stripe/stripeServerClient';
import { isDonationCampaignStripeDrive } from '@/types/donationCampaigns';

const shareBodySchema = z.object({
  profileIds: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> }
) {
  try {
    const { id: trailblaizeChapterId, campaignId } = await params;

    const donationCtx = await resolveDonationCampaignsApiContext(request, trailblaizeChapterId);
    if (!donationCtx.ok) {
      return donationCtx.response;
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = shareBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data: campaign, error: campErr } = await donationCtx.supabase
      .from('donation_campaigns')
      .select('stripe_price_id, crowded_collection_id')
      .eq('id', campaignId)
      .eq('chapter_id', trailblaizeChapterId)
      .maybeSingle();

    if (campErr || !campaign) {
      return NextResponse.json({ error: 'Donation campaign not found' }, { status: 404 });
    }

    if (isDonationCampaignStripeDrive(campaign)) {
      const stripe = getStripeServer();
      if (!stripe) {
        return NextResponse.json(
          { error: 'Stripe is not configured on the server' },
          { status: 503 }
        );
      }
      const connectId = donationCtx.stripeConnectAccountId?.trim();
      if (!connectId) {
        return NextResponse.json(
          {
            error:
              'Chapter has no Stripe Connect account — complete Connect onboarding before sharing.',
          },
          { status: 400 }
        );
      }

      const result = await addDonationCampaignRecipientsForStripeCampaign({
        supabase: donationCtx.supabase,
        trailblaizeChapterId,
        donationCampaignId: campaignId,
        profileIds: parsed.data.profileIds,
      });

      if (!result.ok) {
        const status =
          result.code === 'NOT_FOUND'
            ? 404
            : result.code === 'EMPTY_SELECTION'
              ? 400
              : result.code === 'INVALID_MEMBERS'
                ? 400
                : 400;
        return NextResponse.json({ error: result.error, code: result.code }, { status });
      }

      const profileIdsUnique = [...new Set(parsed.data.profileIds.map((id) => id.trim()).filter(Boolean))];
      const { data: recipientRows, error: recLookupErr } = await donationCtx.supabase
        .from('donation_campaign_recipients')
        .select('id')
        .eq('donation_campaign_id', campaignId)
        .in('profile_id', profileIdsUnique);

      if (recLookupErr) {
        console.error('share POST: recipient id lookup after Stripe upsert:', recLookupErr);
      }

      const recipientIds = (recipientRows ?? []).map((r) => r.id as string).filter(Boolean);
      const baseUrl = getBaseUrl().replace(/\/$/, '');
      const successUrl = `${baseUrl}/dashboard?donationPaid=1&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${baseUrl}/dashboard?donationCanceled=1`;

      const stripeCheckout =
        recipientIds.length > 0
          ? await ensureStripeCheckoutSessionsForRecipientIds({
              supabase: donationCtx.supabase,
              stripe,
              connectAccountId: connectId,
              trailblaizeChapterId,
              donationCampaignId: campaignId,
              recipientIds,
              successUrl,
              cancelUrl,
            })
          : { created: 0, skippedAlreadySet: 0, failures: [] as { recipientId: string; error: string }[] };

      return NextResponse.json(
        {
          data: {
            saved: result.saved,
            stripeCheckout,
          },
        },
        { status: 200 }
      );
    }

    const ctx = await resolveCrowdedChapterApiContext(request, trailblaizeChapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    let crowdedClient;
    try {
      crowdedClient = createCrowdedClientFromEnv();
    } catch (e) {
      console.error('Crowded client config error:', e);
      return NextResponse.json(
        { error: 'Crowded API is not configured on the server' },
        { status: 503 }
      );
    }

    const result = await addDonationCampaignRecipients({
      supabase: ctx.supabase,
      crowded: crowdedClient,
      trailblaizeChapterId,
      crowdedChapterId: ctx.crowdedChapterId,
      donationCampaignId: campaignId,
      profileIds: parsed.data.profileIds,
    });

    if (!result.ok) {
      const status =
        result.code === 'NOT_FOUND'
          ? 404
          : result.code === 'EMPTY_SELECTION'
            ? 400
            : result.code === 'INVALID_MEMBERS'
              ? 400
              : result.code === 'CONTACT_NOT_MATCHED'
                ? 409
                : result.code === 'CROWDED_CONTACT_CREATE_FAILED'
                  ? 502
                  : 400;
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }

    return NextResponse.json({ data: { saved: result.saved } }, { status: 200 });
  } catch (error) {
    if (error instanceof CrowdedApiError) {
      return NextResponse.json(
        { error: error.message, code: error.type },
        { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 }
      );
    }
    console.error('POST donation share:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
