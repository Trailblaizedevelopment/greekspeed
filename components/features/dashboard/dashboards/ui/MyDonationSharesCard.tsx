'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { HeartHandshake, ChevronRight, LayoutGrid } from 'lucide-react';
import { useMyDonationCampaignShares } from '@/lib/hooks/useMyDonationCampaignShares';
import type { MyDonationCampaignShare } from '@/types/myDonationCampaignShares';
import type { DonationCampaignKind } from '@/types/donationCampaigns';
import { cn } from '@/lib/utils';
import { DonationShareDetailDrawer } from './DonationShareDetailDrawer';

function formatUsdFromCents(cents: number | null): string | null {
  if (cents == null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function kindLabel(kind: DonationCampaignKind): string {
  switch (kind) {
    case 'fundraiser':
      return 'Fundraiser';
    case 'open':
      return 'Open amount';
    case 'fixed':
      return 'Fixed amount';
    default:
      return 'Donation';
  }
}

function goalProgressPercent(raisedCents: number, goalCents: number | null | undefined): number {
  const goal =
    goalCents != null && Number.isFinite(Number(goalCents)) && Number(goalCents) > 0
      ? Math.floor(Number(goalCents))
      : null;
  if (goal == null || goal <= 0) return 0;
  return Math.min(100, Math.round((raisedCents / goal) * 1000) / 10);
}

export interface MyDonationSharesCardProps {
  chapterId?: string | null;
  /** Opens full chapter donation hub (`?view=donations`) when combined with `chapterId`. */
  showBrowseButton?: boolean;
}

export function MyDonationSharesCard({ chapterId, showBrowseButton = false }: MyDonationSharesCardProps) {
  const router = useRouter();
  const { data = [], isLoading, isError, error, refetch, isFetching } = useMyDonationCampaignShares(true);
  const [selected, setSelected] = useState<MyDonationCampaignShare | null>(null);

  const cid = chapterId?.trim() ?? '';
  const canBrowse = Boolean(showBrowseButton && cid);

  return (
    <>
      <Card className="rounded-xl border border-gray-200 bg-white shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-brand-primary shrink-0" />
              Donations for you
            </CardTitle>
            {canBrowse ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 h-8 px-2 text-gray-600 hover:text-gray-900"
                onClick={() => router.push('/dashboard?view=donations')}
                aria-label="View all chapter donations"
              >
                <LayoutGrid className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline text-xs font-medium">View all</span>
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-gray-500 font-normal">
            Donations your chapter shared with you. Tap a row for details and checkout.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : isError ? (
            <div className="space-y-2">
              <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'Could not load'}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : data.length === 0 ? (
            <p className="text-sm text-gray-600">No donations have been shared with you yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.map((row) => {
                const goal = row.goalAmountCents;
                const hasGoal = goal != null && Number(goal) > 0;
                const pct = goalProgressPercent(row.campaignTotalRaisedCents, goal);
                const raisedLabel = formatUsdFromCents(row.campaignTotalRaisedCents);
                const goalLabel = formatUsdFromCents(goal);

                return (
                  <li key={row.recipientId}>
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className={cn(
                        'w-full text-left rounded-lg border border-gray-100 bg-gray-50/90',
                        'px-3 py-2.5 transition-colors hover:bg-gray-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-gray-900 text-sm leading-snug truncate">{row.title}</p>
                            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <span
                              className={cn(
                                'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
                                'bg-primary-50 text-brand-primary border border-primary-100'
                              )}
                            >
                              {kindLabel(row.kind)}
                            </span>
                            {hasGoal && raisedLabel && goalLabel ? (
                              <span className="text-[10px] text-gray-500 truncate tabular-nums">
                                {raisedLabel} / {goalLabel}
                              </span>
                            ) : null}
                          </div>
                          {hasGoal ? (
                            <Progress value={pct} className="h-1.5 mt-1.5" />
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!isLoading && data.length > 0 && isFetching ? (
            <p className="text-xs text-gray-400 pt-1">Refreshing…</p>
          ) : null}
        </CardContent>
      </Card>

      {selected ? (
        <DonationShareDetailDrawer
          share={selected}
          isOpen
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
