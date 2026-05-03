import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveDonationCampaignsApiContext } from '@/lib/services/donations/resolveDonationCampaignsApiContext';
import { updateDonationCampaignChapterHubVisible } from '@/lib/services/donations/updateDonationCampaignChapterHubVisible';

const patchBodySchema = z.object({
  chapterHubVisible: z.boolean(),
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

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = patchBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await updateDonationCampaignChapterHubVisible({
      supabase: ctx.supabase,
      chapterId: trailblaizeChapterId,
      campaignId,
      chapterHubVisible: parsed.data.chapterHubVisible,
    });

    if (!result.ok) {
      const status = result.error === 'Campaign not found' ? 404 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ data: { chapterHubVisible: parsed.data.chapterHubVisible } }, { status: 200 });
  } catch (e) {
    console.error('PATCH donation campaign:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
