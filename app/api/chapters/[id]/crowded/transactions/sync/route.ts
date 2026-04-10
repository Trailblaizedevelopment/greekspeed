import { NextRequest, NextResponse } from 'next/server';
import { createCrowdedClientFromEnv } from '@/lib/services/crowded/crowded-client';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { syncCrowdedTransactionsForTrailblaizeChapter } from '@/lib/services/crowded/syncCrowdedTransactions';

/**
 * TRA-418: Pull Crowded ledger transactions into `crowded_transactions`.
 * POST body optional: `{ "crowdedAccountId": "<opaque account id>" }` to scope one account.
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

    let crowdedAccountId: string | undefined;
    try {
      const body = (await request.json()) as unknown;
      if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
        const o = body as Record<string, unknown>;
        const raw = o.crowdedAccountId;
        if (typeof raw === 'string' && raw.trim()) {
          crowdedAccountId = raw.trim();
        }
      }
    } catch {
      /* empty body */
    }

    let crowdedClient;
    try {
      crowdedClient = createCrowdedClientFromEnv();
    } catch (e) {
      console.error('Crowded client config (transactions sync):', e);
      return NextResponse.json(
        { error: 'Crowded API is not configured on the server' },
        { status: 503 }
      );
    }

    const result = await syncCrowdedTransactionsForTrailblaizeChapter(
      ctx.supabase,
      crowdedClient,
      trailblaizeChapterId,
      ctx.crowdedChapterId,
      crowdedAccountId ? { crowdedAccountId } : undefined
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        upserted: result.upserted,
        accountsScanned: result.accountsScanned,
        errors: result.errors,
      },
    });
  } catch (error) {
    console.error('POST /api/chapters/[id]/crowded/transactions/sync:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
