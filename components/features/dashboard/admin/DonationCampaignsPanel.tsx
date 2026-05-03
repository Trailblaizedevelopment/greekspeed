'use client';

import { Fragment, useCallback, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileSearch,
  Loader2,
  MoreVertical,
  Search,
  Share2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectItem } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useDonationCampaigns } from '@/lib/hooks/useDonationCampaigns';
import { useDonationRecipients } from '@/lib/hooks/useDonationCampaignShare';
import {
  isDonationCampaignStripeDrive,
  type DonationCampaign,
  type DonationCampaignCreateKind,
} from '@/types/donationCampaigns';
import { STRIPE_OPEN_DONATION_MIN_CENTS } from '@/lib/services/donations/createStripeDonationCampaignOnConnect';
import type { DonationCampaignRecipientRow } from '@/types/donationCampaignRecipients';
import { DonationShareDialog } from '@/components/features/dashboard/admin/DonationShareDialog';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function formatCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(Number(cents))) return '—';
  return money.format(Number(cents) / 100);
}

const KIND_OPTIONS: { value: DonationCampaignCreateKind; label: string }[] = [
  { value: 'open', label: 'Open amount (goal only)' },
  { value: 'fundraiser', label: 'Fundraiser' },
];

function kindLabel(kind: DonationCampaignCreateKind): string {
  return KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
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
  /**
   * When true, copy and labels describe Stripe (Connect + Payment Link).
   * API still falls back to Crowded if Connect is not ready but Crowded is.
   */
  stripeDonationsPrimary?: boolean;
}

export function DonationCampaignsPanel({
  chapterId,
  enabled,
  stripeDonationsPrimary = false,
}: DonationCampaignsPanelProps) {
  const { listQuery, createMutation, syncShareLinkMutation } = useDonationCampaigns(chapterId, enabled);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DonationCampaignCreateKind>('open');
  const [goalUsd, setGoalUsd] = useState('');
  const [publicFundraising, setPublicFundraising] = useState(true);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [shareForCampaign, setShareForCampaign] = useState<DonationCampaign | null>(null);

  const recipientsQuery = useDonationRecipients(
    chapterId,
    expandedCampaignId,
    enabled && Boolean(expandedCampaignId)
  );

  const copyText = useCallback(async (text: string, successMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMsg);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      toast.error('Enter a title');
      return;
    }

    const g = Number(goalUsd);
    if (!Number.isFinite(g) || g <= 0) {
      toast.error('Enter a valid goal greater than zero');
      return;
    }
    const goalAmountCents = Math.round(g * 100);
    if (goalAmountCents < 1) {
      toast.error('Goal is too small');
      return;
    }
    if (stripeDonationsPrimary && kind === 'open' && goalAmountCents <= STRIPE_OPEN_DONATION_MIN_CENTS) {
      toast.error(
        `Open Stripe drives need a goal above $${(STRIPE_OPEN_DONATION_MIN_CENTS / 100).toFixed(2)} (that goal is the maximum donors can pay).`
      );
      return;
    }

    createMutation.mutate(
      {
        title: t,
        kind,
        goalAmountCents,
        ...(kind === 'fundraiser' ? { showOnPublicFundraisingChannels: publicFundraising } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Donation drive created');
          setTitle('');
          setGoalUsd('');
        },
        onError: (err: Error & { status?: number; code?: string }) => {
          toast.error(err.message || 'Could not create drive');
        },
      }
    );
  };

  const campaigns = listQuery.data ?? [];
  const tableColSpan = 6;

  return (
    <Card className="mt-6 border border-gray-200 bg-white shadow-sm">
      <CardHeader className="border-b border-gray-100 pb-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div>
              <CardTitle className="text-lg text-gray-900">Donations</CardTitle>
              <p className="text-sm text-gray-500 mt-0.5">
                {stripeDonationsPrimary
                  ? 'Create chapter donation drives with Stripe (Payment Link on your connected account).'
                  : 'Create donations for your chapter as open amount collections or fundraisers.'}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="donation-drive-title">Donation title</Label>
              <Input
                id="donation-drive-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Spring philanthropy drive"
                maxLength={500}
                disabled={createMutation.isPending}
                className="max-w-md"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="donation-drive-kind">Drive type</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as DonationCampaignCreateKind)}
                disabled={createMutation.isPending}
                placeholder="Drive type"
              >
                {KIND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="donation-drive-goal">Goal (USD)</Label>
              <Input
                id="donation-drive-goal"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0.01}
                value={goalUsd}
                onChange={(e) => setGoalUsd(e.target.value)}
                placeholder="0.00"
                disabled={createMutation.isPending}
              />
              <p className="text-xs text-gray-500">
                {stripeDonationsPrimary ? (
                  kind === 'open' ? (
                    <>
                      Donors choose any amount from ${(STRIPE_OPEN_DONATION_MIN_CENTS / 100).toFixed(2)} up to this
                      goal (Stripe <span className="font-medium text-gray-700">custom amount</span> cap).
                    </>
                  ) : (
                    'Becomes the fixed donation amount (Stripe Price).'
                  )
                ) : (
                  <>
                    Sent to Crowded as <code className="text-xs">goalAmount</code> in cents.
                  </>
                )}
              </p>
            </div>
            {kind === 'fundraiser' ? (
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer max-w-md">
                <Checkbox
                  checked={publicFundraising}
                  onCheckedChange={(c) => setPublicFundraising(Boolean(c))}
                  disabled={createMutation.isPending}
                  id="donation-public-channels"
                />
                <span>
                  {stripeDonationsPrimary
                    ? 'Show on public fundraising channels (metadata only for Stripe drives)'
                    : 'Show on public fundraising channels (Crowded)'}
                </span>
              </label>
            ) : null}
          </div>

          <Button
            type="submit"
            disabled={createMutation.isPending || listQuery.isLoading}
            className="bg-brand-primary hover:bg-brand-primary-hover rounded-full"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                Creating…
              </>
            ) : (
              'Create'
            )}
          </Button>
        </form>

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
              {stripeDonationsPrimary
                ? 'No donation drives yet. Create one above — a Stripe Payment Link is generated on your connected account when Connect is ready.'
                : 'No donation drives yet. Create one above — it will appear in Crowded Collect for your chapter.'}
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
                    <TableHead className="w-[120px] text-right">
                      {stripeDonationsPrimary ? 'Copy price' : 'Copy ID'}
                    </TableHead>
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
                              disabled={
                                !(row.stripe_price_id?.trim() || row.crowded_collection_id?.trim())
                              }
                              onClick={() => {
                                const id =
                                  row.stripe_price_id?.trim() || row.crowded_collection_id?.trim() || '';
                                copyText(
                                  id,
                                  row.stripe_price_id?.trim()
                                    ? 'Stripe price ID copied'
                                    : 'Crowded collection ID copied'
                                );
                              }}
                              aria-label={
                                row.stripe_price_id?.trim()
                                  ? 'Copy Stripe price ID'
                                  : 'Copy Crowded collection ID'
                              }
                            >
                              <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              <span className="hidden sm:inline text-xs">Copy ID</span>
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
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 border-b border-gray-200/90 pb-3 mb-6">
                                  <p className="text-sm text-gray-600">
                                    Shared with{' '}
                                    <span className="font-medium text-gray-900 tabular-nums">
                                      {recipientsQuery.isLoading ? '…' : recipientsQuery.data?.length ?? 0}
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
                                      <DropdownMenuContent align="end" className="min-w-[11rem]">
                                        <DropdownMenuItem disabled>Edit collection</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          disabled
                                          className="text-red-600 focus:text-red-600"
                                        >
                                          Delete collection
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>

                                {recipientsQuery.isLoading ? (
                                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                                    <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
                                    Loading recipients…
                                  </div>
                                ) : recipientsQuery.isError ? (
                                  <p className="py-8 text-center text-sm text-red-600">
                                    {recipientsQuery.error.message}
                                  </p>
                                ) : (recipientsQuery.data?.length ?? 0) > 0 ? (
                                  <div className="overflow-x-auto rounded-lg border border-gray-200/80 bg-white">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-gray-50/90">
                                          <TableHead>Name</TableHead>
                                          <TableHead className="hidden sm:table-cell">Role</TableHead>
                                          <TableHead className="tabular-nums">Paid</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead className="whitespace-nowrap w-[1%]">
                                            {stripeDonationsPrimary ? 'Pay link' : 'Crowded link'}
                                          </TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {recipientsQuery.data!.map((rec) => (
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
                                            <TableCell className="tabular-nums text-sm text-gray-600">—</TableCell>
                                            <TableCell>
                                              <Badge
                                                variant="secondary"
                                                className="bg-amber-50 text-amber-900 border-amber-200 font-normal text-xs"
                                              >
                                                Not paid
                                              </Badge>
                                            </TableCell>
                                            <TableCell
                                              className="text-right sm:text-left"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              {(() => {
                                                const rowIsStripeDrive = isDonationCampaignStripeDrive(row);
                                                const shareUrl =
                                                  rec.stripe_checkout_url?.trim() ||
                                                  rec.crowded_checkout_url?.trim() ||
                                                  row.crowded_share_url?.trim();
                                                const canSync =
                                                  rowIsStripeDrive ||
                                                  Boolean(row.crowded_collection_id?.trim());
                                                const syncing =
                                                  syncShareLinkMutation.isPending &&
                                                  syncShareLinkMutation.variables?.campaignId === row.id &&
                                                  syncShareLinkMutation.variables?.recipientId === rec.id;
                                                const siblingSyncing =
                                                  syncShareLinkMutation.isPending &&
                                                  syncShareLinkMutation.variables?.campaignId === row.id &&
                                                  !syncing;

                                                if (shareUrl) {
                                                  return (
                                                    <a
                                                      href={shareUrl}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className={cn(
                                                        buttonVariants({
                                                          variant: 'outline',
                                                          size: 'sm',
                                                        }),
                                                        'h-8 gap-1.5 inline-flex items-center justify-center no-underline whitespace-nowrap'
                                                      )}
                                                    >
                                                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                                      Open
                                                    </a>
                                                  );
                                                }

                                                return (
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 gap-1.5 rounded-full text-xs"
                                                    disabled={!canSync || syncing || siblingSyncing}
                                                    title={
                                                      canSync
                                                        ? rowIsStripeDrive
                                                          ? 'Create Stripe Checkout link for this member'
                                                          : 'Fetch share URL from Crowded and save it for members'
                                                        : rowIsStripeDrive
                                                          ? 'Missing Stripe price on this drive'
                                                          : 'Missing Crowded collection on this drive'
                                                    }
                                                    onClick={() => {
                                                      syncShareLinkMutation.mutate(
                                                        { campaignId: row.id, recipientId: rec.id },
                                                        {
                                                        onSuccess: (d) => {
                                                          if (d.source === 'stripe_checkout') {
                                                            toast.success(
                                                              d.alreadySet
                                                                ? 'Checkout link was already saved for this member'
                                                                : 'Stripe Checkout link created for this member — they can pay from the link.'
                                                            );
                                                          } else if (d.source === 'intent') {
                                                            toast.success(
                                                              d.alreadySet
                                                                ? 'Checkout link was already saved for this member'
                                                                : stripeDonationsPrimary
                                                                  ? 'Stripe payment link saved for this member.'
                                                                  : 'Crowded Collect checkout link created — member can pay from Trailblaize or the link; a Collect request should appear in Crowded for this contact.'
                                                            );
                                                          } else {
                                                            toast.success(
                                                              d.alreadySet
                                                                ? 'Checkout link was already saved'
                                                                : stripeDonationsPrimary
                                                                  ? 'Payment link saved — member can open it to pay with Stripe.'
                                                                  : 'Checkout link saved — members can open it from their dashboard'
                                                            );
                                                          }
                                                        },
                                                        onError: (err) => {
                                                          toast.error(
                                                            err instanceof Error
                                                              ? err.message
                                                              : stripeDonationsPrimary
                                                                ? 'Could not save Stripe payment link'
                                                                : 'Could not fetch link from Crowded'
                                                          );
                                                        },
                                                      }
                                                      );
                                                    }}
                                                  >
                                                    {syncing ? (
                                                      <Loader2
                                                        className="h-3.5 w-3.5 animate-spin shrink-0"
                                                        aria-hidden
                                                      />
                                                    ) : null}
                                                    Create link
                                                  </Button>
                                                );
                                              })()}
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
                                      {stripeDonationsPrimary ? (
                                        <>
                                          Use <span className="font-medium text-gray-700">Share</span> to add
                                          chapter members, then <span className="font-medium text-gray-700">Create link</span>{' '}
                                          to attach the Stripe payment URL for each row.
                                        </>
                                      ) : (
                                        <>
                                          Use <span className="font-medium text-gray-700">Share</span> to link
                                          chapter members who have a Crowded contact. Payment status will update when
                                          Collect payments are wired.
                                        </>
                                      )}
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
          stripeShareFlow={isDonationCampaignStripeDrive(shareForCampaign)}
        />
      ) : null}
    </Card>
  );
}
