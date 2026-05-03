import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createCrowdedClientFromEnv, CrowdedApiError } from '@/lib/services/crowded/crowded-client';
import { createDonationCampaignRecipientCheckoutUrl } from '@/lib/services/donations/createDonationCampaignRecipientCheckoutUrl';
import { createStripeDonationRecipientCheckoutSession } from '@/lib/services/donations/createStripeDonationRecipientCheckoutSession';
import { resolveDonationCampaignsApiContext } from '@/lib/services/donations/resolveDonationCampaignsApiContext';
import { syncDonationCampaignCrowdedShareUrl } from '@/lib/services/donations/syncDonationCampaignCrowdedShareUrl';
import { clientIpFromRequest } from '@/lib/utils/clientIpFromRequest';
import { getBaseUrl } from '@/lib/utils/urlUtils';
import { isDonationCampaignStripeDrive } from '@/types/donationCampaigns';
import { getStripeServer } from '@/lib/services/stripe/stripeServerClient';

const patchBodySchema = z.object({
  donationCampaignRecipientId: z.string().uuid().optional(),
});

function statusForCollectionSyncCode(code: string): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'NO_COLLECTION':
      return 400;
    case 'NO_LINK':
      return 422;
    case 'CROWDED_ERROR':
      return 502;
    default:
      return 500;
  }
}

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

    if (isDonationCampaignStripeDrive(campaign)) {
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
          { error: 'This Stripe drive is missing its payment link — recreate the drive or contact support.' },
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
    }

    const crowdedChapterId = ctx.crowdedChapterId;
    if (!crowdedChapterId) {
      return NextResponse.json(
        { error: 'Chapter is not linked to Crowded — cannot sync Crowded share link for this drive.' },
        { status: 400 }
      );
    }

    let crowded;
    try {
      crowded = createCrowdedClientFromEnv();
    } catch (e) {
      console.error('Crowded client config (share-link PATCH):', e);
      return NextResponse.json(
        { error: 'Crowded API is not configured on the server' },
        { status: 503 }
      );
    }

    const collectionSync = await syncDonationCampaignCrowdedShareUrl({
      supabase: ctx.supabase,
      crowded,
      trailblaizeChapterId,
      crowdedChapterId,
      donationCampaignId: campaignId,
    });

    if (collectionSync.ok) {
      return NextResponse.json({
        data: {
          crowdedShareUrl: collectionSync.crowdedShareUrl,
          alreadySet: collectionSync.alreadySet,
          source: 'collection' as const,
        },
      });
    }

    if (donationCampaignRecipientId && collectionSync.code === 'NO_LINK') {
      const baseUrl = getBaseUrl().replace(/\/$/, '');
      const successUrl = `${baseUrl}/dashboard?donationPaid=true`;
      const failureUrl = `${baseUrl}/dashboard?donationCanceled=true`;

      const intent = await createDonationCampaignRecipientCheckoutUrl({
        supabase: ctx.supabase,
        crowded,
        trailblaizeChapterId,
        crowdedChapterId,
        donationCampaignId: campaignId,
        donationCampaignRecipientId,
        payerIp: clientIpFromRequest(request),
        successUrl,
        failureUrl,
      });

      if (intent.ok) {
        return NextResponse.json({
          data: {
            crowdedShareUrl: intent.paymentUrl,
            alreadySet: intent.alreadySet,
            source: 'intent' as const,
          },
        });
      }

      return NextResponse.json(
        { error: intent.error, code: intent.code ?? 'INTENT_FAILED' },
        { status: intent.httpStatus >= 400 && intent.httpStatus < 600 ? intent.httpStatus : 502 }
      );
    }

    const hint =
      collectionSync.code === 'NO_LINK' && !donationCampaignRecipientId
        ? ' Use Create link on a member row to generate a per-member Crowded Collect checkout (intent).'
        : '';

    return NextResponse.json(
      { error: `${collectionSync.error}${hint}`, code: collectionSync.code },
      { status: statusForCollectionSyncCode(collectionSync.code) }
    );
  } catch (e) {
    if (e instanceof CrowdedApiError) {
      return NextResponse.json(
        { error: e.message, code: e.type, details: e.details },
        { status: e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502 }
      );
    }
    console.error('PATCH donation share-link:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
