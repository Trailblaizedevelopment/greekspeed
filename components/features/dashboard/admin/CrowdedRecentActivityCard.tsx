'use client';

import { useState } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCrowdedRecentTransactions } from '@/lib/hooks/useCrowdedRecentTransactions';
import type { CrowdedRecentTransactionRow } from '@/types/crowdedRecentTransactions';

export interface CrowdedRecentActivityCardProps {
  chapterId: string;
  enabled: boolean;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function formatTransactionDate(row: CrowdedRecentTransactionRow): string {
  const raw = row.postedAt ?? row.occurredAt ?? row.effectiveAt;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusBadgeClass(status: string | null): string {
  const normalized = (status ?? '').trim().toLowerCase();
  if (normalized.includes('posted') || normalized.includes('succeeded') || normalized.includes('complete')) {
    return 'border-green-200 bg-green-50 text-green-700';
  }
  if (normalized.includes('pending') || normalized.includes('processing')) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (normalized.includes('failed') || normalized.includes('declined') || normalized.includes('reversed')) {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  return 'border-gray-200 bg-gray-50 text-gray-700';
}

function formatAmount(row: CrowdedRecentTransactionRow): string {
  if (row.amountUsd == null) return '—';
  return currencyFormatter.format(row.amountUsd);
}

export function CrowdedRecentActivityCard({
  chapterId,
  enabled,
}: CrowdedRecentActivityCardProps) {
  const query = useCrowdedRecentTransactions(chapterId, enabled);
  const [refreshing, setRefreshing] = useState(false);

  const refreshTransactions = async () => {
    if (!enabled || refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/crowded/transactions/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: { upserted: number; errors: string[] }; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        toast.error(json?.error || `Could not refresh transactions (${res.status})`);
        return;
      }

      if (json.data?.errors?.length) {
        toast.warn(json.data.errors[0] || 'Transactions refreshed with warnings.');
      } else {
        toast.success('Recent transactions refreshed.');
      }

      await query.refetch();
    } catch (error) {
      console.error('Crowded transaction refresh failed:', error);
      toast.error('Network error refreshing transactions');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
      <CardHeader className="border-b border-primary-100/30">
        <CardTitle className="text-primary-900 flex items-center gap-2">
          Recent Transactions
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-4">
        {query.isPending ? (
          <div className="flex items-center gap-2 text-sm text-gray-600 py-8">
            <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
            Loading recent transactions...
          </div>
        ) : query.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50/80 p-3 text-sm text-red-800">
            <p className="font-medium">Could not load recent activity</p>
            <p className="mt-1">{query.error.message}</p>
          </div>
        ) : !query.data?.ok || query.data.data.transactions.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-600">
            No recent Crowded transactions synced yet.
          </div>
        ) : (
          <div className="space-y-3">
            {query.data.data.transactions.map((transaction) => (
              <div
                key={`${transaction.crowdedAccountId}:${transaction.crowdedTransactionId}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {transaction.description}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">{formatTransactionDate(transaction)}</p>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-medium text-primary-900 tabular-nums">
                    {formatAmount(transaction)}
                  </p>
                  <Badge
                    variant="outline"
                    className={`mt-1 text-[11px] font-normal ${getStatusBadgeClass(transaction.status)}`}
                  >
                    {transaction.status || 'Unknown'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <div className="border-t border-primary-100/30 px-6 py-4">
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto rounded-full"
          disabled={refreshing}
          onClick={() => void refreshTransactions()}
        >
          {refreshing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Refreshing transactions...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh transactions
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
