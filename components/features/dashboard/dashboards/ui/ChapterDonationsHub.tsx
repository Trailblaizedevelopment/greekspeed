'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { useChapterDonationBrowse } from '@/lib/hooks/useChapterDonationBrowse';
import type { ChapterDonationBrowseEntry } from '@/types/chapterDonationBrowse';
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

type SourceFilter = 'all' | 'shared_with_you' | 'chapter_public';

export interface ChapterDonationsHubProps {
  chapterId: string;
  onClose: () => void;
}

export function ChapterDonationsHub({ chapterId, onClose }: ChapterDonationsHubProps) {
  const queryClient = useQueryClient();
  const { data = [], isLoading, isError, error, refetch, isFetching } = useChapterDonationBrowse(chapterId, true);
  const [selected, setSelected] = useState<{
    share: MyDonationCampaignShare;
    listingSource: ChapterDonationBrowseEntry['listingSource'];
  } | null>(null);

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ queryKey: ['chapter-donation-browse', chapterId] });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [chapterId, queryClient]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((entry) => {
      if (sourceFilter !== 'all' && entry.listingSource !== sourceFilter) return false;
      if (!q) return true;
      const title = entry.share.title?.toLowerCase() ?? '';
      const desc = entry.share.description?.toLowerCase() ?? '';
      return title.includes(q) || desc.includes(q);
    });
  }, [data, search, sourceFilter]);

  return (
    <>
      {/*
        Match SocialFeed column: mobile bleeds slightly; sm+ centered max-w-2xl with same vertical rhythm.
      */}
      <div className="space-y-2 sm:space-y-5 w-[calc(100%+2rem)] -mx-4 max-w-none sm:mx-auto sm:w-full sm:max-w-2xl min-h-[320px]">
        {/* Header — same shell as “Start a post” card */}
        <Card className="rounded-2xl border border-gray-100 bg-white/80 shadow-sm transition hover:shadow-md">
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">Chapter donations</h2>
                <p className="text-sm text-gray-500 mt-1 leading-snug">
                  Donations shared with you and chapter-listed fundraisers.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 self-start rounded-full border-gray-200"
                onClick={onClose}
              >
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back to feed</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input
            type="search"
            placeholder="Search by title or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl border-gray-200 bg-white pl-10 pr-3 shadow-sm focus-visible:ring-brand-primary/20"
            aria-label="Search donations"
          />
        </div>

        {/* Source tabs — mirror SocialFeed segmented control */}
        <div
          role="tablist"
          aria-label="Donation listing filter"
          className="flex w-full items-center justify-center gap-0 sm:rounded-xl sm:border sm:border-gray-200 sm:bg-gray-50/80 sm:p-1"
        >
          {(
            [
              { id: 'all' as const, label: 'All' },
              { id: 'shared_with_you' as const, label: 'Shared' },
              { id: 'chapter_public' as const, label: 'Public' },
            ] satisfies { id: SourceFilter; label: string }[]
          ).map((tab, index) => (
            <span key={tab.id} className="flex min-w-0 flex-1 items-center sm:flex-1">
              {index > 0 && (
                <span className="pointer-events-none px-2 text-gray-300 sm:hidden" aria-hidden>
                  |
                </span>
              )}
              <button
                type="button"
                onClick={() => setSourceFilter(tab.id)}
                role="tab"
                aria-selected={sourceFilter === tab.id}
                className={cn(
                  'w-full text-center text-sm font-medium transition-colors py-2 px-2 sm:flex sm:flex-1 sm:items-center sm:justify-center sm:rounded-lg sm:py-2.5 sm:px-3',
                  sourceFilter === tab.id
                    ? 'text-gray-900 sm:bg-white sm:shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 sm:text-gray-600 sm:hover:bg-white/50 sm:hover:text-gray-900'
                )}
              >
                {tab.label}
              </button>
            </span>
          ))}
        </div>

        {/* List — same outer treatment as virtualized post stack */}
        <div className="rounded-none border-0 bg-transparent shadow-none sm:rounded-2xl sm:border sm:border-gray-200 sm:bg-white sm:shadow-sm overflow-hidden">
          <div className="p-3 sm:p-4 space-y-2">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 text-sm">Loading donations…</p>
              </div>
            ) : isError ? (
              <div className="space-y-2 py-4">
                <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'Could not load'}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                  Retry
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 sm:py-12 px-2">
                <p className="text-gray-600 text-sm">
                  {data.length === 0
                    ? 'No donations to show yet. Ask your treasurer to share a donation with you, or ask them to list a donation on the chapter donation hub (Public in Manage → Dues).'
                    : 'No donations match your search or filters.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((entry) => {
                  const row = entry.share;
                  const goal = row.goalAmountCents;
                  const hasGoal = goal != null && Number(goal) > 0;
                  const pct = goalProgressPercent(row.campaignTotalRaisedCents, goal);
                  const raisedLabel = formatUsdFromCents(row.campaignTotalRaisedCents);
                  const goalLabel = formatUsdFromCents(goal);

                  return (
                    <li key={`${entry.listingSource}-${row.recipientId}`}>
                      <button
                        type="button"
                        onClick={() => setSelected({ share: row, listingSource: entry.listingSource })}
                        className={cn(
                          'w-full text-left rounded-xl border border-gray-100 bg-gray-50/90',
                          'px-3 py-2.5 sm:px-4 sm:py-3 transition-colors hover:bg-gray-100/90',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-gray-900 text-sm leading-snug truncate">{row.title}</p>
                              <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <span
                                className={cn(
                                  'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
                                  'bg-primary-50 text-brand-primary border border-primary-100'
                                )}
                              >
                                {kindLabel(row.kind)}
                              </span>
                              <span
                                className={cn(
                                  'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 border border-gray-200',
                                  'bg-white text-gray-600'
                                )}
                              >
                                Stripe
                              </span>
                              <span
                                className={cn(
                                  'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 border',
                                  entry.listingSource === 'shared_with_you'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                                    : 'bg-amber-50 text-amber-900 border-amber-100'
                                )}
                              >
                                {entry.listingSource === 'shared_with_you' ? 'Shared with you' : 'Chapter listing'}
                              </span>
                              {hasGoal && raisedLabel && goalLabel ? (
                                <span className="text-[10px] text-gray-500 truncate tabular-nums ml-auto">
                                  {raisedLabel} / {goalLabel}
                                </span>
                              ) : null}
                            </div>
                            {hasGoal ? (
                              <Progress value={pct} className="h-1.5 mt-2" />
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
              <p className="text-xs text-gray-400 pt-2 text-center sm:text-left">Refreshing…</p>
            ) : null}
          </div>
        </div>
      </div>

      {selected ? (
        <DonationShareDetailDrawer share={selected.share} isOpen onClose={() => setSelected(null)} />
      ) : null}
    </>
  );
}
