import { NextRequest, NextResponse } from 'next/server';
import { donationCampaignPatchBodySchema } from '@/lib/services/donations/donationCampaignSchemas';
import { deleteDonationCampaign } from '@/lib/services/donations/deleteDonationCampaign';
import { patchDonationCampaign } from '@/lib/services/donations/patchDonationCampaign';
import { resolveDonationCampaignsApiContext } from '@/lib/services/donations/resolveDonationCampaignsApiContext';
import { getStripeServer } from '@/lib/services/stripe/stripeServerClient';

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

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = donationCampaignPatchBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const stripe = getStripeServer();
    const result = await patchDonationCampaign({
      supabase: ctx.supabase,
      stripe,
      stripeConnectAccountId: ctx.stripeConnectAccountId,
      chapterId: trailblaizeChapterId,
      campaignId,
      patch: parsed.data,
    });

    if (!result.ok) {
      const status =
        result.httpStatus >= 400 && result.httpStatus < 600 ? result.httpStatus : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ data: result.campaign }, { status: 200 });
  } catch (e) {
    console.error('PATCH donation campaign:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> }
) {
  try {
    const { id: trailblaizeChapterId, campaignId } = await params;

    const ctx = await resolveDonationCampaignsApiContext(request, trailblaizeChapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    const stripe = getStripeServer();
    const result = await deleteDonationCampaign({
      supabase: ctx.supabase,
      stripe,
      stripeConnectAccountId: ctx.stripeConnectAccountId,
      chapterId: trailblaizeChapterId,
      campaignId,
    });

    if (!result.ok) {
      const status =
        result.httpStatus >= 400 && result.httpStatus < 600 ? result.httpStatus : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ data: { deleted: true } }, { status: 200 });
  } catch (e) {
    console.error('DELETE donation campaign:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
