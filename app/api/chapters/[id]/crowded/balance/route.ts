import { NextRequest, NextResponse } from 'next/server';
import { createCrowdedClientFromEnv } from '@/lib/services/crowded/crowded-client';
import { getCrowdedChapterBalanceForChapter } from '@/lib/services/crowded/getCrowdedChapterBalance';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import type { CrowdedChapterBalanceApiResponse } from '@/types/crowdedBalance';

/**
 * Crowded chapter account balances for treasurer dashboard (TRA-417).
 * Auth + chapter manager + crowded_integration_enabled + crowded_chapter_id.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trailblaizeChapterId } = await params;

    const ctx = await resolveCrowdedChapterApiContext(request, trailblaizeChapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    let crowdedClient;
    try {
      crowdedClient = createCrowdedClientFromEnv();
    } catch (e) {
      console.error('Crowded client config (balance route):', e);
      return NextResponse.json(
        { error: 'Crowded API is not configured on the server' },
        { status: 503 }
      );
    }

    const result = await getCrowdedChapterBalanceForChapter(
      ctx.supabase,
      crowdedClient,
      trailblaizeChapterId,
      ctx.crowdedChapterId
    );

    if (!result.ok) {
      const body: CrowdedChapterBalanceApiResponse =
        result.code === 'no_customer'
          ? { ok: false, code: 'no_customer', message: result.message }
          : {
              ok: false,
              code: 'api_error',
              message: result.message,
              statusCode: result.statusCode,
            };
      return NextResponse.json(body, { status: 200 });
    }

    const body: CrowdedChapterBalanceApiResponse = {
      ok: true,
      data: {
        balanceUsd: result.balanceUsd,
        totalBalanceMinor: result.totalBalanceMinor,
        syncedAt: result.syncedAt,
        accountCount: result.accountCount,
        accounts: result.accounts,
        dbSyncError: result.dbSyncError,
      },
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error('GET /api/chapters/[id]/crowded/balance:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
