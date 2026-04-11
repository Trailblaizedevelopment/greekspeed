import { NextRequest, NextResponse } from 'next/server';
import { CrowdedApiError, createCrowdedClientFromEnv } from '@/lib/services/crowded/crowded-client';
import { crowdedCreateCollectionAppRequestSchema } from '@/lib/services/crowded/crowded-schemas';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { createCrowdedCollectionAndLinkDuesCycle } from '@/lib/services/dues/linkCrowdedCollectionForDuesCycle';

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

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = crowdedCreateCollectionAppRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.duesCycleId) {
      const { data: cycle, error: cycErr } = await ctx.supabase
        .from('dues_cycles')
        .select('id, chapter_id, crowded_collection_id')
        .eq('id', parsed.data.duesCycleId)
        .maybeSingle();

      if (cycErr || !cycle) {
        return NextResponse.json({ error: 'Dues cycle not found' }, { status: 404 });
      }
      if (String(cycle.chapter_id) !== trailblaizeChapterId) {
        return NextResponse.json({ error: 'Dues cycle does not belong to this chapter' }, { status: 403 });
      }
      const linked = (cycle.crowded_collection_id as string | null | undefined)?.trim();
      if (linked) {
        return NextResponse.json(
          {
            error:
              'This dues cycle already has a Crowded collection. Create a new cycle or use the existing collection in Crowded.',
            code: 'ALREADY_LINKED',
          },
          { status: 409 }
        );
      }
    }

    if (parsed.data.duesCycleId) {
      const link = await createCrowdedCollectionAndLinkDuesCycle({
        request,
        trailblaizeChapterId,
        duesCycleId: parsed.data.duesCycleId,
        collectionTitle: parsed.data.title,
        requestedAmountCents: parsed.data.requestedAmount,
      });
      if (!link.ok) {
        return link.response;
      }
      return NextResponse.json(
        {
          data: {
            id: link.collectionId,
            title: parsed.data.title,
            requestedAmount: parsed.data.requestedAmount,
            goalAmount: null,
            createdAt: new Date().toISOString(),
          },
        },
        { status: 201 }
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

    const result = await crowdedClient.createCollection(ctx.crowdedChapterId, {
      data: {
        title: parsed.data.title,
        requestedAmount: parsed.data.requestedAmount,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CrowdedApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 }
      );
    }
    console.error('Crowded create collection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
