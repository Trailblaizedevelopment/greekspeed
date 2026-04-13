import { NextRequest, NextResponse } from 'next/server';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import type { CrowdedRecentTransactionRow } from '@/types/crowdedRecentTransactions';

type CrowdedTransactionDbRow = {
  crowded_account_id: string;
  crowded_transaction_id: string;
  amount_minor: number | null;
  currency: string | null;
  description: string | null;
  status: string | null;
  occurred_at: string | null;
  posted_at: string | null;
  synced_at: string;
  created_at: string;
};

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function effectiveAt(row: CrowdedTransactionDbRow): string {
  return row.posted_at ?? row.occurred_at ?? row.synced_at ?? row.created_at;
}

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

    const { data, error } = await ctx.supabase
      .from('crowded_transactions')
      .select(
        'crowded_account_id, crowded_transaction_id, amount_minor, currency, description, status, occurred_at, posted_at, synced_at, created_at'
      )
      .eq('chapter_id', trailblaizeChapterId)
      .order('synced_at', { ascending: false })
      .limit(25);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = ((data ?? []) as CrowdedTransactionDbRow[])
      .map<CrowdedRecentTransactionRow>((row) => ({
        crowdedTransactionId: row.crowded_transaction_id,
        crowdedAccountId: row.crowded_account_id,
        description: row.description?.trim() || 'Crowded transaction',
        status: row.status?.trim() || null,
        amountMinor: row.amount_minor,
        amountUsd:
          typeof row.amount_minor === 'number' && Number.isFinite(row.amount_minor)
            ? row.amount_minor / 100
            : null,
        effectiveAt: effectiveAt(row),
        postedAt: row.posted_at,
        occurredAt: row.occurred_at,
        syncedAt: row.synced_at,
        currency: row.currency,
      }))
      .sort((a, b) => toTimestamp(b.effectiveAt) - toTimestamp(a.effectiveAt))
      .slice(0, 5);

    return NextResponse.json({
      ok: true,
      data: {
        transactions: rows,
      },
    });
  } catch (error) {
    console.error('GET /api/chapters/[id]/crowded/transactions/recent:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
