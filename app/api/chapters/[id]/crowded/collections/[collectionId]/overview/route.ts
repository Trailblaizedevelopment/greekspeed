import { NextRequest, NextResponse } from 'next/server';
import { CrowdedApiError, createCrowdedClientFromEnv } from '@/lib/services/crowded/crowded-client';
import { buildCrowdedCollectOverview } from '@/lib/services/crowded/crowdedCollectOverview';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; collectionId: string }> }
) {
  try {
    const { id: trailblaizeChapterId, collectionId } = await params;
    const collectionIdTrim = collectionId?.trim();
    if (!collectionIdTrim) {
      return NextResponse.json({ ok: false, error: 'Missing collection id' }, { status: 400 });
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
        { ok: false, error: 'Crowded API is not configured on the server' },
        { status: 503 }
      );
    }

    const overview = await buildCrowdedCollectOverview({
      supabase: ctx.supabase,
      crowded: crowdedClient,
      trailblaizeChapterId,
      crowdedChapterId: ctx.crowdedChapterId,
      collectionId: collectionIdTrim,
    });

    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof Error && error.message === 'dues_cycle_not_found_for_collection') {
      return NextResponse.json(
        {
          ok: false,
          error: 'No dues cycle linked to this collection for your chapter.',
          code: 'CYCLE_NOT_LINKED',
        },
        { status: 404 }
      );
    }
    if (error instanceof CrowdedApiError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: 'CROWDED_API_ERROR' },
        { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 }
      );
    }
    console.error('Crowded collect overview error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
