import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createCrowdedClientFromEnv, CrowdedApiError } from '@/lib/services/crowded/crowded-client';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { syncChapterContactsToCrowded } from '@/lib/services/crowded/syncChapterContactsToCrowded';
import { isFeatureEnabled } from '@/types/featureFlags';

const syncBodySchema = z.object({
  memberIds: z.array(z.string().uuid()).optional(),
});

/**
 * POST — Bulk-ensure Crowded chapter contacts from Trailblaize member profiles (opt-in flag).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trailblaizeChapterId } = await params;
    const ctx = await resolveCrowdedChapterApiContext(request, trailblaizeChapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    if (!isFeatureEnabled(ctx.featureFlags, 'crowded_contact_sync_enabled')) {
      return NextResponse.json(
        {
          error:
            'Crowded contact sync is not enabled for this chapter. Turn on “Crowded contact sync” in developer feature flags (or chapter settings).',
          code: 'CONTACT_SYNC_DISABLED',
        },
        { status: 403 }
      );
    }

    let json: unknown = {};
    try {
      const text = await request.text();
      if (text.trim()) json = JSON.parse(text) as unknown;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = syncBodySchema.safeParse(json);
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

    const summary = await syncChapterContactsToCrowded({
      supabase: ctx.supabase,
      crowded: crowdedClient,
      trailblaizeChapterId,
      crowdedChapterId: ctx.crowdedChapterId,
      memberIds: parsed.data.memberIds,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    if (error instanceof CrowdedApiError) {
      return NextResponse.json(
        { error: error.message, code: 'CROWDED_API_ERROR' },
        { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 }
      );
    }
    console.error('Crowded contacts sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
