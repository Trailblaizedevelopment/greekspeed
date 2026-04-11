import { NextRequest, NextResponse } from 'next/server';
import { CrowdedApiError, createCrowdedClientFromEnv } from '@/lib/services/crowded/crowded-client';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';

/**
 * Creates a Crowded collection and persists `dues_cycles.crowded_collection_id` in one step.
 * Refuses if the cycle is already linked (prevents duplicate Crowded collections).
 */
export async function createCrowdedCollectionAndLinkDuesCycle(params: {
  request: NextRequest;
  trailblaizeChapterId: string;
  duesCycleId: string;
  collectionTitle: string;
  requestedAmountCents: number;
}): Promise<
  | { ok: true; collectionId: string }
  | { ok: false; response: NextResponse }
> {
  const ctx = await resolveCrowdedChapterApiContext(params.request, params.trailblaizeChapterId);
  if (!ctx.ok) {
    return { ok: false, response: ctx.response };
  }

  const { data: cycle, error } = await ctx.supabase
    .from('dues_cycles')
    .select('id, chapter_id, crowded_collection_id')
    .eq('id', params.duesCycleId)
    .maybeSingle();

  if (error || !cycle) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Dues cycle not found' }, { status: 404 }),
    };
  }

  if (String(cycle.chapter_id) !== params.trailblaizeChapterId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Dues cycle does not belong to this chapter' }, { status: 403 }),
    };
  }

  const existing = (cycle.crowded_collection_id as string | null | undefined)?.trim();
  if (existing) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'This dues cycle already has a Crowded collection. Unlinking is disabled to avoid duplicate collections in Crowded.',
          code: 'ALREADY_LINKED',
        },
        { status: 409 }
      ),
    };
  }

  let crowdedClient;
  try {
    crowdedClient = createCrowdedClientFromEnv();
  } catch (e) {
    console.error('Crowded client config error:', e);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Crowded API is not configured on the server' },
        { status: 503 }
      ),
    };
  }

  try {
    const result = await crowdedClient.createCollection(ctx.crowdedChapterId, {
      data: {
        title: params.collectionTitle,
        requestedAmount: params.requestedAmountCents,
      },
    });
    const collectionId = result.data?.id?.trim();
    if (!collectionId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Crowded did not return a collection id' },
          { status: 502 }
        ),
      };
    }

    const { error: updErr } = await ctx.supabase
      .from('dues_cycles')
      .update({
        crowded_collection_id: collectionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.duesCycleId);

    if (updErr) {
      console.error('Persist crowded_collection_id after Crowded create:', updErr);
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              'A Crowded collection was created but could not be linked to this dues cycle. Contact support with the collection id.',
            collectionId,
          },
          { status: 500 }
        ),
      };
    }

    return { ok: true, collectionId };
  } catch (e) {
    if (e instanceof CrowdedApiError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: e.message, code: 'CROWDED_API_ERROR' },
          { status: e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502 }
        ),
      };
    }
    throw e;
  }
}
