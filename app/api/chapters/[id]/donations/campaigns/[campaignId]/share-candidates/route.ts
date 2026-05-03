import { NextRequest, NextResponse } from 'next/server';
import { listDonationShareCandidates } from '@/lib/services/donations/donationCampaignShareService';
import { resolveDonationCampaignsApiContext } from '@/lib/services/donations/resolveDonationCampaignsApiContext';

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

    const result = await listDonationShareCandidates({
      supabase: donationCtx.supabase,
      trailblaizeChapterId,
      donationCampaignId: campaignId,
    });

    if (!result.ok) {
      const isLegacy =
        result.error.includes('not a Stripe-backed') || result.error.includes('Legacy Crowded');
      return NextResponse.json(
        { error: result.error, code: isLegacy ? 'LEGACY_CAMPAIGN' : undefined },
        { status: isLegacy ? 410 : 404 }
      );
    }

    return NextResponse.json({ data: result.candidates });
  } catch (error) {
    console.error('GET donation share-candidates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
