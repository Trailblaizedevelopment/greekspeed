import { NextRequest, NextResponse } from 'next/server';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { listDonationCampaignRecipients } from '@/lib/services/donations/donationCampaignShareService';

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

    const result = await listDonationCampaignRecipients({
      supabase: ctx.supabase,
      donationCampaignId: campaignId,
      trailblaizeChapterId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ data: result.rows });
  } catch (e) {
    console.error('GET donation recipients:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
