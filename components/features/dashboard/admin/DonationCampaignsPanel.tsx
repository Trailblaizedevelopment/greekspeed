'use client';

import { useCallback, useState } from 'react';
import { Copy, Gift, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useDonationCampaigns } from '@/lib/hooks/useDonationCampaigns';
import type { DonationCampaign, DonationCampaignCreateKind } from '@/types/donationCampaigns';

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

export interface DonationCampaignsPanelProps {
  chapterId: string;
  /** Same gate as other Crowded treasurer UI */
  enabled: boolean;
}

export function DonationCampaignsPanel({ chapterId, enabled }: DonationCampaignsPanelProps) {
  const { listQuery, createMutation } = useDonationCampaigns(chapterId, enabled);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DonationCampaignCreateKind>('open');
  const [goalUsd, setGoalUsd] = useState('');
  const [publicFundraising, setPublicFundraising] = useState(true);

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

  return (
    <Card className="mt-6 border border-gray-200 bg-white shadow-sm">
      <CardHeader className="border-b border-gray-100 pb-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div>
              <CardTitle className="text-lg text-gray-900">Donations</CardTitle>
              <p className="text-sm text-gray-500 mt-0.5">
                Create donations for your chapter as open amount collections or fundraisers.
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
                Sent to Crowded as <code className="text-xs">goalAmount</code> in cents.
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
                <span>Show on public fundraising channels (Crowded)</span>
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
          <h3 className="text-sm font-medium text-gray-900 mb-3">Your drives</h3>
          {listQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
              Loading…
            </div>
          ) : listQuery.isError ? (
            <p className="text-sm text-red-600 py-2">{listQuery.error.message}</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 border border-dashed border-gray-200 rounded-lg px-4">
              No donation drives yet. Create one above — it will appear in Crowded Collect for your chapter.
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
                    <TableHead className="w-[120px] text-right">Copy ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((row: DonationCampaign) => (
                    <TableRow key={row.id}>
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
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2"
                          disabled={!row.crowded_collection_id?.trim()}
                          onClick={() => copyText(row.crowded_collection_id!.trim(), 'Crowded collection ID copied')}
                          aria-label="Copy Crowded collection ID"
                        >
                          <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="hidden sm:inline text-xs">Copy ID</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
