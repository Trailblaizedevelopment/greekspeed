import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createCrowdedClientFromEnv, CrowdedApiError } from '@/lib/services/crowded/crowded-client';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { addDonationCampaignRecipients } from '@/lib/services/donations/donationCampaignShareService';

const shareBodySchema = z.object({
  profileIds: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> }
) {
  try {
    const { id: trailblaizeChapterId, campaignId } = await params;
    const ctx = await resolveCrowdedChapterApiContext(request, trailblaizeChapterId);
    if (!ctx.ok) {
      return ctx.response;
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
