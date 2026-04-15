import { NextRequest, NextResponse } from 'next/server';
import { createCrowdedClientFromEnv, CrowdedApiError } from '@/lib/services/crowded/crowded-client';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { listDonationShareCandidates } from '@/lib/services/donations/donationCampaignShareService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> }
) {
  try {
    const { id: trailblaizeChapterId, campaignId } = await params;
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
