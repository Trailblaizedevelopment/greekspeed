import { NextRequest, NextResponse } from 'next/server';
import { createCrowdedClientFromEnv, CrowdedApiError } from '@/lib/services/crowded/crowded-client';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import {
  listDonationShareCandidates,
  listDonationShareCandidatesForStripeCampaign,
} from '@/lib/services/donations/donationCampaignShareService';
import { resolveDonationCampaignsApiContext } from '@/lib/services/donations/resolveDonationCampaignsApiContext';
import { isDonationCampaignStripeDrive } from '@/types/donationCampaigns';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> }
) {
  try {
    const { id: trailblaizeChapterId, campaignId } = await params;

    const donationCtx = await resolveDonationCampaignsApiContext(request, trailblaizeChapterId);
    if (!donationCtx.ok) {
      return donationCtx.response;
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
      const result = await listDonationShareCandidatesForStripeCampaign({
        supabase: donationCtx.supabase,
        trailblaizeChapterId,
        donationCampaignId: campaignId,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json({ data: result.candidates });
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

    const result = await listDonationShareCandidates({
      supabase: ctx.supabase,
      crowded: crowdedClient,
      trailblaizeChapterId,
      crowdedChapterId: ctx.crowdedChapterId,
      donationCampaignId: campaignId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ data: result.candidates });
  } catch (error) {
    if (error instanceof CrowdedApiError) {
      return NextResponse.json(
        { error: error.message, code: error.type },
        { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 }
      );
    }
    console.error('GET donation share-candidates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
