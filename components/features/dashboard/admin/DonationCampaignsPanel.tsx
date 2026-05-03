'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  FileSearch,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Share2,
  CircleHelp,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { isDonationChapterHubPublic } from '@/lib/services/donations/chapterDonationBrowseService';
import { useDonationCampaigns } from '@/lib/hooks/useDonationCampaigns';
import { useDonationRecipients } from '@/lib/hooks/useDonationCampaignShare';
import type { DonationCampaign } from '@/types/donationCampaigns';
import type { DonationCampaignRecipientRow } from '@/types/donationCampaignRecipients';
import { DonationShareDialog } from '@/components/features/dashboard/admin/DonationShareDialog';
import { CreateDonationCampaignWizard } from '@/components/features/dashboard/admin/CreateDonationCampaignWizard';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function formatCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(Number(cents))) return '—';
  return money.format(Number(cents) / 100);
}

/** Supabase / JSON may return BIGINT as string; treat any finite number > 0 as paid amount. */
function coerceCents(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function recipientPaidCents(rec: DonationCampaignRecipientRow): number {
  return coerceCents(rec.amount_paid_cents);
}

function recipientIsPaid(rec: DonationCampaignRecipientRow): boolean {
  if (rec.paid_at && String(rec.paid_at).trim()) return true;
  return recipientPaidCents(rec) > 0;
}

function formatPaidAt(iso: string | null | undefined): string {
  if (!iso || !String(iso).trim()) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Stripe-backed rows store the Connect Payment Link URL in `crowded_share_url` (shared naming with legacy Crowded). */
function campaignPublicPayUrl(campaign: DonationCampaign): string | null {
  const raw = campaign.crowded_share_url?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function donationProgressSummary(
  recipients: DonationCampaignRecipientRow[] | undefined,
  goalAmountCents: number | null | undefined,
  publicPaymentTotalCents?: number
): {
  raisedCents: number;
  goalCents: number | null;
  paidRecipientCount: number;
  totalRecipients: number;
  guestPaidCents: number;
  percentTowardGoal: number;
} {
  const list = recipients ?? [];
  let raisedCents = 0;
  let paidRecipientCount = 0;
  for (const r of list) {
    const c = recipientPaidCents(r);
    raisedCents += c;
    if (recipientIsPaid(r)) paidRecipientCount += 1;
  }
  const guestPaidCents =
    publicPaymentTotalCents != null && Number.isFinite(Number(publicPaymentTotalCents))
      ? Math.max(0, Math.floor(Number(publicPaymentTotalCents)))
      : 0;
  raisedCents += guestPaidCents;
  const goalCents =
    goalAmountCents != null && Number.isFinite(Number(goalAmountCents)) && Number(goalAmountCents) > 0
      ? Math.floor(Number(goalAmountCents))
      : null;
  const percentTowardGoal =
    goalCents != null && goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 1000) / 10) : 0;
  return {
    raisedCents,
    goalCents,
    paidRecipientCount,
    totalRecipients: list.length,
    guestPaidCents,
    percentTowardGoal,
  };
}

function recipientDisplayName(r: DonationCampaignRecipientRow['profile']): string {
  const fn = (r.first_name ?? '').trim();
  const ln = (r.last_name ?? '').trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ').trim() || 'Member';
  const full = (r.full_name ?? '').trim();
  return full || 'Member';
}

function recipientInitials(r: DonationCampaignRecipientRow['profile']): string {
  const name = recipientDisplayName(r);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || '?';
}

export interface DonationCampaignsPanelProps {
  chapterId: string;
  /** Panel is mounted; parent controls visibility via flags. */
  enabled: boolean;
}

export function DonationCampaignsPanel({ chapterId, enabled }: DonationCampaignsPanelProps) {
  const queryClient = useQueryClient();
  const {
    listQuery,
    createMutation,
    updateChapterHubVisibleMutation,
    updateCampaignMutation,
    deleteCampaignMutation,
  } = useDonationCampaigns(chapterId, enabled);
  const [donationWizardOpen, setDonationWizardOpen] = useState(false);
  const [donationWizardEdit, setDonationWizardEdit] = useState<DonationCampaign | null>(null);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [shareForCampaign, setShareForCampaign] = useState<DonationCampaign | null>(null);

  const recipientsQuery = useDonationRecipients(
    chapterId,
    expandedCampaignId,
    enabled && Boolean(expandedCampaignId),
    { refetchIntervalMs: 12_000 }
  );

  const refetchRecipients = useCallback(() => {
    const cap = expandedCampaignId?.trim();
    if (!chapterId.trim() || !cap) return;
    void queryClient.invalidateQueries({ queryKey: ['donation-recipients', chapterId.trim(), cap] });
  }, [chapterId, expandedCampaignId, queryClient]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const v = new URLSearchParams(window.location.search).get('donationPaid');
    if (v === '1' || v === 'true') {
      void queryClient.invalidateQueries({ queryKey: ['donation-recipients'] });
      void queryClient.invalidateQueries({ queryKey: ['chapter-donation-browse'] });
      void queryClient.invalidateQueries({ queryKey: ['my-donation-campaign-shares'] });
    }
  }, [enabled, queryClient]);

  const copyText = useCallback(async (text: string, successMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMsg);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }, []);

  const campaigns = listQuery.data ?? [];
  const tableColSpan = 6;

  return (
    <Card className="mt-6 border border-gray-200 bg-white shadow-sm">
      <CardHeader className="border-b border-gray-100 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <CardTitle className="text-lg text-gray-900">Donations</CardTitle>
            <p className="text-sm text-gray-500 mt-0.5">
              Create chapter donations with Stripe (Payment Link on your connected account).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-full border-brand-primary/40 text-brand-primary hover:bg-brand-primary/5 sm:self-start"
            disabled={listQuery.isLoading}
            onClick={() => {
              setDonationWizardEdit(null);
              setDonationWizardOpen(true);
            }}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Create donation
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <CreateDonationCampaignWizard
          open={donationWizardOpen}
          onOpenChange={(next) => {
            setDonationWizardOpen(next);
            if (!next) setDonationWizardEdit(null);
          }}
          chapterId={chapterId}
          editingCampaign={donationWizardEdit}
          createMutateAsync={createMutation.mutateAsync}
          updateMutateAsync={updateCampaignMutation.mutateAsync}
          isCreatePending={createMutation.isPending}
          isUpdatePending={updateCampaignMutation.isPending}
        />

        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Your donations</h3>
          {listQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
              Loading…
            </div>
          ) : listQuery.isError ? (
            <p className="text-sm text-red-600 py-2">{listQuery.error.message}</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 border border-dashed border-gray-200 rounded-lg px-4">
              No donations yet. Use Create donation — a Stripe Payment Link is generated on your connected account
              when Connect is ready.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80">
                    <TableHead>Donation title</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead className="tabular-nums whitespace-nowrap">Goal</TableHead>
                    <TableHead className="hidden sm:table-cell">Created</TableHead>
                    <TableHead className="w-[120px] text-right">Pay URL</TableHead>
                    <TableHead className="w-12 px-2" aria-label="Expand row" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((row: DonationCampaign) => {
                    const isExpanded = expandedCampaignId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          data-state={isExpanded ? 'open' : 'closed'}
                          className={cn(
                            'cursor-pointer border-gray-200 transition-colors',
                            isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50/70'
                          )}
                          onClick={() =>
                            setExpandedCampaignId((cur) => (cur === row.id ? null : row.id))
                          }
                        >
                          <TableCell className="font-medium text-gray-900 max-w-[200px] truncate">
                            {row.title}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-normal text-xs">
                              {row.kind}
                            </Badge>
                          </TableCell>
                          <TableCell className="tabular-nums text-gray-700">
                            {formatCents(row.goal_amount_cents)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-gray-500 whitespace-nowrap">
                            {row.created_at
                              ? new Date(row.created_at).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : '—'}
                          </TableCell>
                          <TableCell
                            className="text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 px-2 rounded-full"
                              disabled={!campaignPublicPayUrl(row)}
                              title={
                                campaignPublicPayUrl(row)
                                  ? 'Copy the public Stripe checkout link for this donation'
                                  : 'Payment link is not available yet for this donation'
                              }
                              onClick={() => {
                                const url = campaignPublicPayUrl(row);
                                if (url) void copyText(url, 'Checkout link copied');
                              }}
                              aria-label="Copy public checkout link"
                            >
                              <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              <span className="hidden sm:inline text-xs">Copy link</span>
                            </Button>
                          </TableCell>
                          <TableCell className="w-12 px-2 text-gray-500" aria-hidden>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 mx-auto shrink-0" />
                            ) : (
                              <ChevronDown className="h-4 w-4 mx-auto shrink-0" />
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow className="border-0 hover:bg-transparent">
                            <TableCell colSpan={tableColSpan} className="p-0 border-t border-gray-200">
                              <div className="bg-gray-50/95 px-4 sm:px-6 py-4">
                                {(row.description?.trim() || row.hero_image_url?.trim()) && (
                                  <div className="mb-4 flex flex-col gap-3 rounded-lg border border-gray-200/80 bg-white p-3 sm:flex-row sm:items-start">
                                    {row.hero_image_url?.trim() ? (
                                      // eslint-disable-next-line @next/next/no-img-element -- external treasurer-provided URL
                                      <img
                                        src={row.hero_image_url.trim()}
                                        alt=""
                                        className="h-28 w-full shrink-0 rounded-md object-cover sm:h-24 sm:w-40"
                                      />
                                    ) : null}
                                    {row.description?.trim() ? (
                                      <p className="text-sm text-gray-700 whitespace-pre-wrap min-w-0 flex-1">
                                        {row.description.trim()}
                                      </p>
                                    ) : null}
                                  </div>
                                )}
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 border-b border-gray-200/90 pb-3 mb-4">
                                  <p className="text-sm text-gray-600">
                                    Shared with{' '}
                                    <span className="font-medium text-gray-900 tabular-nums">
                                      {recipientsQuery.isLoading
                                        ? '…'
                                        : recipientsQuery.data?.recipients?.length ?? 0}
                                    </span>{' '}
                                    chapter members
                                  </p>
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 w-9 shrink-0 p-0 text-gray-500 rounded-full"
                                      disabled
                                      title="Search (coming soon)"
                                      aria-label="Search members (coming soon)"
                                    >
                                      <Search className="h-4 w-4" aria-hidden />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-9 gap-1.5 rounded-full text-gray-600 border-gray-200"
                                      title="Refresh payment totals and status"
                                      aria-label="Refresh recipient payment data"
                                      disabled={recipientsQuery.isFetching}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        refetchRecipients();
                                      }}
                                    >
                                      <RefreshCw
                                        className={cn(
                                          'h-4 w-4 shrink-0',
                                          recipientsQuery.isFetching && 'animate-spin'
                                        )}
                                        aria-hidden
                                      />
                                      <span className="hidden sm:inline text-xs">Refresh</span>
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-9 gap-1.5 rounded-full border-brand-primary/40 text-brand-primary hover:bg-brand-primary/5"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShareForCampaign(row);
                                      }}
                                    >
                                      <Share2 className="h-4 w-4 shrink-0" aria-hidden />
                                      Share
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-9 text-gray-400 rounded-full"
                                      disabled
                                      title="Coming soon"
                                    >
                                      Send Reminders
                                    </Button>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                        aria-label="More actions"
                                      >
                                        <MoreVertical className="h-4 w-4" aria-hidden />
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="min-w-[14rem]">
                                        <DropdownMenuItem
                                          onClick={() => {
                                            setDonationWizardEdit(row);
                                            setDonationWizardOpen(true);
                                          }}
                                        >
                                          Edit collection
                                        </DropdownMenuItem>
                                        <div
                                          className="flex cursor-default items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm outline-none"
                                          onClick={(e) => e.stopPropagation()}
                                          onPointerDown={(e) => e.stopPropagation()}
                                        >
                                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                            <span className="font-medium text-gray-900">Public</span>
                                            <span
                                              className="inline-flex shrink-0 text-gray-400 hover:text-gray-600"
                                              title="Public: listed on the chapter donation hub for every chapter member. Private: only people you share with (this table) see the donation with their personal link."
                                              aria-label="Public vs private chapter listing"
                                            >
                                              <CircleHelp className="h-4 w-4" aria-hidden />
                                            </span>
                                          </span>
                                          <span className="inline-flex shrink-0">
                                            <Switch
                                              checked={isDonationChapterHubPublic(row.metadata, row.kind)}
                                              disabled={
                                                updateChapterHubVisibleMutation.isPending &&
                                                updateChapterHubVisibleMutation.variables?.campaignId === row.id
                                              }
                                              onCheckedChange={(next) => {
                                                updateChapterHubVisibleMutation.mutate(
                                                  { campaignId: row.id, chapterHubVisible: next },
                                                  {
                                                    onSuccess: () =>
                                                      toast.success(
                                                        next
                                                          ? 'Donation is public on the chapter donation hub.'
                                                          : 'Donation is private — only shared members see it on the hub.'
                                                      ),
                                                    onError: (err) =>
                                                      toast.error(
                                                        err instanceof Error ? err.message : 'Could not update'
                                                      ),
                                                  }
                                                );
                                              }}
                                            />
                                          </span>
                                        </div>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-red-600 focus:text-red-600"
                                          disabled={
                                            deleteCampaignMutation.isPending &&
                                            deleteCampaignMutation.variables === row.id
                                          }
                                          onClick={() => {
                                            const title = row.title?.trim() || 'this donation';
                                            if (
                                              !window.confirm(
                                                `Delete “${title}”? This removes the campaign, all shared member links, public hub checkouts tied to it, and any linked ledger rows. Stripe checkout links will stop accepting new payments. This cannot be undone.`
                                              )
                                            ) {
                                              return;
                                            }
                                            deleteCampaignMutation.mutate(row.id, {
                                              onSuccess: () => {
                                                toast.success('Donation deleted');
                                                setExpandedCampaignId((cur) =>
                                                  cur === row.id ? null : cur
                                                );
                                                setShareForCampaign((cur) =>
                                                  cur?.id === row.id ? null : cur
                                                );
                                                setDonationWizardEdit((cur) =>
                                                  cur?.id === row.id ? null : cur
                                                );
                                              },
                                              onError: (err) =>
                                                toast.error(
                                                  err instanceof Error ? err.message : 'Could not delete'
                                                ),
                                            });
                                          }}
                                        >
                                          Delete collection
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>

                                {!recipientsQuery.isLoading &&
                                !recipientsQuery.isError &&
                                ((recipientsQuery.data?.recipients?.length ?? 0) > 0 ||
                                  (recipientsQuery.data?.publicPaymentTotalCents ?? 0) > 0) ? (
                                  <div className="mb-5 rounded-xl border border-gray-200/90 bg-white px-4 py-3 shadow-sm">
                                    {(() => {
                                      const prog = donationProgressSummary(
                                        recipientsQuery.data?.recipients,
                                        row.goal_amount_cents,
                                        recipientsQuery.data?.publicPaymentTotalCents
                                      );
                                      return (
                                        <div className="space-y-2">
                                          <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
                                            <p className="text-sm font-medium text-gray-900">
                                              Progress toward goal
                                            </p>
                                            <p className="text-xs text-gray-500 tabular-nums">
                                              {prog.paidRecipientCount} paid · {prog.totalRecipients} shared
                                              {(() => {
                                                const n =
                                                  recipientsQuery.data?.publicPayments?.length ?? 0;
                                                if (n < 1) return null;
                                                return (
                                                  <span>
                                                    {' '}
                                                    · {n} public checkout{n === 1 ? '' : 's'} (
                                                    {formatCents(prog.guestPaidCents)})
                                                  </span>
                                                );
                                              })()}
                                            </p>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums text-gray-700">
                                            <span className="font-semibold text-gray-900">
                                              {formatCents(prog.raisedCents)}
                                            </span>
                                            <span className="text-gray-400">of</span>
                                            <span>
                                              {prog.goalCents != null
                                                ? formatCents(prog.goalCents)
                                                : '—'}{' '}
                                              goal
                                            </span>
                                            {prog.goalCents != null && prog.goalCents > 0 ? (
                                              <span className="text-gray-500">
                                                ({prog.percentTowardGoal.toFixed(0)}%)
                                              </span>
                                            ) : null}
                                          </div>
                                          {prog.goalCents != null && prog.goalCents > 0 ? (
                                            <Progress
                                              value={prog.percentTowardGoal}
                                              className="h-2.5 bg-gray-100"
                                              aria-label={`${prog.percentTowardGoal}% of goal raised from recorded payments`}
                                            />
                                          ) : (
                                            <p className="text-xs text-gray-500">
                                              Totals include shared members (Stripe Checkout) plus optional public
                                              Stripe Payment Link checkouts for this donation.
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ) : null}

                                {recipientsQuery.isLoading ? (
                                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                                    <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
                                    Loading recipients…
                                  </div>
                                ) : recipientsQuery.isError ? (
                                  <p className="py-8 text-center text-sm text-red-600">
                                    {recipientsQuery.error.message}
                                  </p>
                                ) : (recipientsQuery.data?.recipients?.length ?? 0) > 0 ? (
                                  <div className="overflow-x-auto rounded-lg border border-gray-200/80 bg-white">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-gray-50/90">
                                          <TableHead>Name</TableHead>
                                          <TableHead className="hidden sm:table-cell">Role</TableHead>
                                          <TableHead className="tabular-nums whitespace-nowrap">
                                            Amount received
                                          </TableHead>
                                          <TableHead className="hidden md:table-cell whitespace-nowrap">
                                            Paid on
                                          </TableHead>
                                          <TableHead>Status</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {recipientsQuery.data!.recipients.map((rec) => (
                                          <TableRow key={rec.id}>
                                            <TableCell>
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-700">
                                                  {recipientInitials(rec.profile)}
                                                </span>
                                                <span className="min-w-0">
                                                  <span className="block truncate text-sm font-medium text-gray-900">
                                                    {recipientDisplayName(rec.profile)}
                                                  </span>
                                                  {rec.profile.email ? (
                                                    <span className="block truncate text-xs text-gray-500">
                                                      {rec.profile.email}
                                                    </span>
                                                  ) : null}
                                                </span>
                                              </div>
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell text-sm text-gray-600">
                                              Member
                                            </TableCell>
                                            <TableCell className="tabular-nums text-sm text-gray-700">
                                              {recipientIsPaid(rec)
                                                ? formatCents(recipientPaidCents(rec))
                                                : '—'}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell text-sm text-gray-600 whitespace-nowrap">
                                              {recipientIsPaid(rec) ? formatPaidAt(rec.paid_at) : '—'}
                                            </TableCell>
                                            <TableCell>
                                              {recipientIsPaid(rec) ? (
                                                <Badge
                                                  variant="secondary"
                                                  className="bg-emerald-50 text-emerald-900 border-emerald-200 font-normal text-xs"
                                                >
                                                  Paid
                                                </Badge>
                                              ) : (
                                                <Badge
                                                  variant="secondary"
                                                  className="bg-amber-50 text-amber-900 border-amber-200 font-normal text-xs"
                                                >
                                                  Not paid
                                                </Badge>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center px-4 pb-10 pt-2 text-center">
                                    <div className="rounded-full bg-gray-100/80 p-5 mb-5">
                                      <FileSearch
                                        className="h-12 w-12 text-gray-300"
                                        strokeWidth={1.25}
                                        aria-hidden
                                      />
                                    </div>
                                    <p className="text-base font-semibold text-gray-900">
                                      No trackable payments to display yet
                                    </p>
                                    <p className="text-sm text-gray-500 mt-2 max-w-md leading-relaxed">
                                      Use <span className="font-medium text-gray-700">Share</span> to add chapter
                                      members — a personal Stripe Checkout link is created for each member
                                      automatically so they can pay from their dashboard.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>

      {shareForCampaign ? (
        <DonationShareDialog
          open
          onOpenChange={(open) => {
            if (!open) setShareForCampaign(null);
          }}
          chapterId={chapterId}
          campaignId={shareForCampaign.id}
          campaignTitle={shareForCampaign.title}
        />
      ) : null}
    </Card>
  );
}
