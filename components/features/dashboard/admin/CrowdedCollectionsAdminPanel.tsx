'use client';

import { Fragment, useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  QrCode,
  RefreshCw,
  Search,
  UserPlus,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-toastify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCrowdedCollectOverview } from '@/lib/hooks/useCrowdedCollectOverview';
import { cn } from '@/lib/utils';
import type { CrowdedCollectOverviewRow } from '@/types/crowdedCollectOverview';

export interface CrowdedAdminDuesCycle {
  id: string;
  name: string;
  base_amount: number;
  due_date: string;
  created_at: string;
  crowded_collection_id?: string | null;
}

export interface CrowdedAdminAssignment {
  id: string;
  dues_cycle_id: string;
  status: string;
  amount_assessed: number;
  amount_due: number;
  amount_paid: number;
  user: {
    id: string;
    full_name: string | null;
    email: string | null;
    member_status?: string | null;
  };
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function contactBadge(state: CrowdedCollectOverviewRow['crowdedContact']) {
  if (state.state === 'matched') {
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900 font-normal">
        Crowded contact
      </Badge>
    );
  }
  if (state.state === 'no_profile_email') {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900 font-normal">
        No email
      </Badge>
    );
  }
  if (state.state === 'ambiguous') {
    return (
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-900 font-normal">
        Duplicate email
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-700 font-normal">
      No Crowded match
    </Badge>
  );
}

function intentStatusBadge(row: CrowdedCollectOverviewRow) {
  if (!row.crowdedIntent) {
    return (
      <span className="text-xs text-gray-500 tabular-nums">
        {row.crowdedContact.state === 'matched' ? 'No intent yet' : '—'}
      </span>
    );
  }
  const s = row.crowdedIntent.status.toLowerCase();
  const paidLike = s.includes('paid') && !s.includes('not');
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-normal tabular-nums',
        paidLike
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      )}
    >
      {row.crowdedIntent.status}
    </Badge>
  );
}

export interface CrowdedCollectionsAdminPanelProps {
  chapterId: string;
  cycles: CrowdedAdminDuesCycle[];
  assignments: CrowdedAdminAssignment[];
  linkingCrowdedCycleId: string | null;
  onCreateAndLink: (cycle: CrowdedAdminDuesCycle) => void | Promise<void>;
  /** When true, show “Sync contacts to Crowded” (requires `crowded_contact_sync_enabled` chapter flag). */
  contactSyncEnabled?: boolean;
  /** After a successful contact sync (optional refresh of dues data). */
  onContactsSynced?: () => void | Promise<void>;
}

export function CrowdedCollectionsAdminPanel({
  chapterId,
  cycles,
  assignments,
  linkingCrowdedCycleId,
  onCreateAndLink,
  contactSyncEnabled = false,
  onContactsSynced,
}: CrowdedCollectionsAdminPanelProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);
  const [qrTarget, setQrTarget] = useState<{ label: string; url: string } | null>(null);
  const [checkoutLoadingId, setCheckoutLoadingId] = useState<string | null>(null);
  const [contactSyncLoading, setContactSyncLoading] = useState(false);

  const filteredCycles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cycles;
    return cycles.filter((c) => c.name.toLowerCase().includes(q));
  }, [cycles, search]);

  const statsByCycleId = useMemo(() => {
    const map = new Map<
      string,
      { payers: number; paid: number; due: number; assessed: number }
    >();
    for (const c of cycles) {
      map.set(c.id, { payers: 0, paid: 0, due: 0, assessed: 0 });
    }
    for (const a of assignments) {
      const cur = map.get(a.dues_cycle_id);
      if (!cur) continue;
      cur.payers += 1;
      cur.paid += Number(a.amount_paid) || 0;
      cur.due += Number(a.amount_due) || 0;
      cur.assessed += Number(a.amount_assessed) || 0;
    }
    return map;
  }, [assignments, cycles]);

  const expandedCycle = expandedCycleId ? cycles.find((c) => c.id === expandedCycleId) : null;
  const expandedCollectionId = expandedCycle?.crowded_collection_id?.trim() ?? null;
  const overviewQuery = useCrowdedCollectOverview(
    chapterId,
    expandedCollectionId,
    Boolean(expandedCycleId && expandedCollectionId)
  );

  const assignmentsForExpanded = useMemo(() => {
    if (!expandedCycleId) return [];
    return assignments.filter((a) => a.dues_cycle_id === expandedCycleId);
  }, [assignments, expandedCycleId]);

  const copyText = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }, []);

  const runContactSync = useCallback(async () => {
    if (!contactSyncEnabled || contactSyncLoading) return;
    setContactSyncLoading(true);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/crowded/contacts/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            summary?: {
              alreadyInCrowded: number;
              created: number;
              skippedNoEmail: number;
              skippedDuplicateEmailInProfiles: number;
              skippedNoName: number;
              errors: string[];
            };
            error?: string;
          }
        | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || `Contact sync failed (${res.status})`);
        return;
      }
      const s = json.summary;
      if (s) {
        toast.success(
          `Crowded contacts: ${s.created} created, ${s.alreadyInCrowded} already linked, ${s.skippedNoEmail} no email, ${s.skippedNoName} no name.`
        );
        if (s.errors.length > 0) {
          toast.warn(s.errors.slice(0, 2).join(' '));
        }
      } else {
        toast.success('Crowded contact sync finished.');
      }
      await onContactsSynced?.();
      await queryClient.invalidateQueries({ queryKey: ['crowded-collect-overview', chapterId] });
    } catch {
      toast.error('Network error syncing contacts');
    } finally {
      setContactSyncLoading(false);
    }
  }, [chapterId, contactSyncEnabled, contactSyncLoading, onContactsSynced, queryClient]);

  const requestCheckoutLink = useCallback(
    async (duesAssignmentId: string, collectionId: string) => {
      setCheckoutLoadingId(duesAssignmentId);
      try {
        const res = await fetch(
          `/api/chapters/${chapterId}/crowded/collections/${encodeURIComponent(collectionId)}/checkout-link`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ duesAssignmentId }),
          }
        );
        const json = (await res.json().catch(() => null)) as
          | { paymentUrl?: string; error?: string; code?: string }
          | null;
        if (!res.ok || !json?.paymentUrl) {
          toast.error(json?.error || `Could not create checkout link (${res.status})`);
          return;
        }
        await navigator.clipboard.writeText(json.paymentUrl);
        toast.success('Checkout link copied');
        await queryClient.invalidateQueries({
          queryKey: ['crowded-collect-overview', chapterId, collectionId],
        });
      } catch {
        toast.error('Network error creating checkout link');
      } finally {
        setCheckoutLoadingId(null);
      }
    },
    [chapterId, queryClient]
  );

  return (
    <Card className="mt-4 sm:mt-6 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
      <CardHeader className="border-b border-primary-100/30 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-primary-900 flex items-center gap-2 text-lg sm:text-xl">
              <Link2 className="h-5 w-5 text-brand-primary shrink-0" />
              Chapter Collections
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">
              Manage chapter collections and dues cycles. Link directly to Crowded to assign to members.
              Expand a linked cycle to see assigned members, live collection statuses refresh automatically.
            </p>
          </div>
          {contactSyncEnabled ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 border-brand-primary/40 text-brand-primary-hover"
              disabled={contactSyncLoading}
              onClick={() => void runContactSync()}
            >
              {contactSyncLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Sync chapter contacts to Crowded
            </Button>
          ) : null}
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cycles…"
            className="pl-9 h-9"
            aria-label="Search dues cycles"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {cycles.length === 0 ? (
          <p className="text-sm text-gray-500">Create a dues cycle first, then link a Crowded collection.</p>
        ) : filteredCycles.length === 0 ? (
          <p className="text-sm text-gray-500">No cycles match your search.</p>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                  <TableHead className="w-10 pl-3" />
                  <TableHead>Collection</TableHead>
                  <TableHead className="hidden md:table-cell whitespace-nowrap">Created</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-center w-[72px]">Payers</TableHead>
                  <TableHead className="text-center w-[100px]">Crowded</TableHead>
                  <TableHead className="text-right pr-3 w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCycles.map((cycle) => {
                  const st = statsByCycleId.get(cycle.id);
                  const linked = Boolean(cycle.crowded_collection_id?.trim());
                  const expanded = expandedCycleId === cycle.id;
                  const base = Number(cycle.base_amount);
                  const perPayer = Number.isFinite(base) ? base : 0;

                  return (
                    <Fragment key={cycle.id}>
                      <TableRow
                        className={cn('group', expanded && 'bg-brand-primary/[0.04]')}
                      >
                        <TableCell className="pl-2 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 shrink-0 p-0 text-gray-500"
                            aria-expanded={expanded}
                            aria-label={expanded ? 'Collapse row' : 'Expand row'}
                            onClick={() =>
                              setExpandedCycleId((cur) => (cur === cycle.id ? null : cycle.id))
                            }
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">
                          <div className="flex flex-col gap-0.5">
                            <span>{cycle.name}</span>
                            <span className="text-xs font-normal text-gray-500 md:hidden">
                              Due {new Date(cycle.due_date).toLocaleDateString()}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-gray-600 whitespace-nowrap">
                          {new Date(cycle.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="text-sm tabular-nums text-gray-900">{currency.format(perPayer)}</div>
                          <div className="text-[11px] text-gray-500">Per payer</div>
                          <div className="text-xs text-gray-500 tabular-nums mt-0.5">
                            {currency.format(st?.due ?? 0)} total due
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="text-sm font-medium tabular-nums text-gray-900">
                            {currency.format(st?.paid ?? 0)}
                          </div>
                          <div className="text-[11px] text-gray-500">Trailblaize</div>
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-gray-800">
                          {st?.payers ?? 0}
                        </TableCell>
                        <TableCell className="text-center">
                          {linked ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-800 font-normal"
                            >
                              Linked
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-amber-800 font-normal"
                            >
                              Not linked
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-2">
                          <div className="flex flex-wrap justify-end gap-1">
                            {linked && cycle.crowded_collection_id ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                onClick={() =>
                                  void copyText('Collection id', cycle.crowded_collection_id!)
                                }
                              >
                                <Copy className="h-3.5 w-3.5 sm:mr-1" />
                                <span className="hidden sm:inline">ID</span>
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                className="h-8 bg-brand-primary hover:bg-brand-primary-hover"
                                disabled={linkingCrowdedCycleId !== null}
                                onClick={() => void onCreateAndLink(cycle)}
                              >
                                {linkingCrowdedCycleId === cycle.id ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                    Linking…
                                  </>
                                ) : (
                                  <>
                                    <Link2 className="h-3.5 w-3.5 mr-1" />
                                    Create & link
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                          <TableCell colSpan={8} className="p-0 border-t border-gray-100">
                            <div className="p-4 sm:p-5 space-y-4">
                              {!linked ? (
                                <UnlinkedAssignmentsTable rows={assignmentsForExpanded} />
                              ) : overviewQuery.isLoading ? (
                                <div className="flex items-center gap-2 text-sm text-gray-600 py-6 justify-center">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Loading assignments and Crowded status…
                                </div>
                              ) : overviewQuery.isError ? (
                                <div className="rounded-lg border border-red-200 bg-red-50/80 p-3 text-sm text-red-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <span>{overviewQuery.error.message}</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void overviewQuery.refetch()}
                                  >
                                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                    Retry
                                  </Button>
                                </div>
                              ) : overviewQuery.data?.ok ? (
                                <LinkedCycleDetail
                                  cycle={cycle}
                                  overview={overviewQuery.data}
                                  checkoutLoadingId={checkoutLoadingId}
                                  onCheckout={requestCheckoutLink}
                                  onOpenQr={setQrTarget}
                                  onRefresh={() => void overviewQuery.refetch()}
                                  isFetching={overviewQuery.isFetching}
                                />
                              ) : null}
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
      </CardContent>

      <Dialog open={qrTarget != null} onOpenChange={(o) => !o && setQrTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Checkout QR</DialogTitle>
            <p className="text-sm text-gray-600 font-normal">{qrTarget?.label}</p>
          </DialogHeader>
          {qrTarget?.url ? (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <QRCodeSVG value={qrTarget.url} size={200} level="M" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void copyText('Checkout link', qrTarget.url)}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy link
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function UnlinkedAssignmentsTable({ rows }: { rows: CrowdedAdminAssignment[] }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-900">Assigned members (Trailblaize)</p>
      <p className="text-xs text-gray-500">
        Link this cycle to Crowded to see live collect intent status and treasurer checkout links.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">No assignments on this cycle yet.</p>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead>Member</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="text-right">Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium text-gray-900">{a.user.full_name || '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-gray-600 max-w-[220px] truncate">
                    {a.user.email || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal capitalize">
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{currency.format(a.amount_due)}</TableCell>
                  <TableCell className="text-right tabular-nums text-gray-700">
                    {currency.format(a.amount_paid)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function LinkedCycleDetail({
  cycle,
  overview,
  checkoutLoadingId,
  onCheckout,
  onOpenQr,
  onRefresh,
  isFetching,
}: {
  cycle: CrowdedAdminDuesCycle;
  overview: import('@/types/crowdedCollectOverview').CrowdedCollectOverviewApiOk;
  checkoutLoadingId: string | null;
  onCheckout: (assignmentId: string, collectionId: string) => Promise<void>;
  onOpenQr: (v: { label: string; url: string }) => void;
  onRefresh: () => void;
  isFetching: boolean;
}) {
  const d = overview.data;
  const collectionId = cycle.crowded_collection_id!.trim();
  const previewBase = d.collectPublicBaseUrl?.replace(/\/+$/, '') ?? null;
  const previewUrl = previewBase ? `${previewBase}/collection/${encodeURIComponent(collectionId)}` : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Shared with {d.summary.assignmentCount} contact
            {d.summary.assignmentCount === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Crowded intent list:{' '}
            {d.intentsListAvailable
              ? `${d.summary.intentsWithCrowdedStatus} with live status`
              : 'not available from API (404) — checkout links still work'}
            {d.intentsCrowdedError ? ` — ${d.intentsCrowdedError}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', isFetching && 'animate-spin')} />
            Refresh
          </Button>
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex h-8 items-center justify-center rounded-md border border-gray-300 bg-transparent px-3 text-sm font-medium text-gray-900 hover:bg-gray-100'
              )}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Collect page
            </a>
          ) : null}
        </div>
      </div>

      {d.collectionCrowdedError ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
          Could not refresh collection metadata from Crowded: {d.collectionCrowdedError}
        </p>
      ) : null}

      {d.collectionFromCrowded ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="text-gray-500 text-xs">Crowded title</p>
            <p className="font-medium text-gray-900 truncate">{d.collectionFromCrowded.title}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="text-gray-500 text-xs">Requested (Crowded)</p>
            <p className="font-medium tabular-nums">
              {currency.format(d.collectionFromCrowded.requestedAmountMinor / 100)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="text-gray-500 text-xs">Trailblaize paid / due</p>
            <p className="font-medium tabular-nums">
              {currency.format(d.summary.trailblaizeTotalPaidUsd)} /{' '}
              {currency.format(d.summary.trailblaizeTotalDueUsd)}
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80">
              <TableHead>Member</TableHead>
              <TableHead className="hidden lg:table-cell">Crowded</TableHead>
              <TableHead className="hidden md:table-cell">Intent</TableHead>
              <TableHead className="text-right">Due</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Paid</TableHead>
              <TableHead className="text-right w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.rows.map((row) => {
              const payable =
                !['paid', 'exempt', 'waived'].includes(row.trailblaizeStatus) && row.amountDue > 0.009;
              return (
                <TableRow key={row.assignmentId}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-gray-900">{row.fullName || '—'}</span>
                      <span className="text-xs text-gray-500 truncate max-w-[200px] lg:max-w-[280px]">
                        {row.email || '—'}
                      </span>
                      <div className="lg:hidden mt-1">{contactBadge(row.crowdedContact)}</div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{contactBadge(row.crowdedContact)}</TableCell>
                  <TableCell className="hidden md:table-cell align-middle">
                    {intentStatusBadge(row)}
                    {row.crowdedIntent ? (
                      <div className="text-[11px] text-gray-500 mt-1 tabular-nums">
                        Paid {currency.format(row.crowdedIntent.paidAmountMinor / 100)} /{' '}
                        {currency.format(row.crowdedIntent.requestedAmountMinor / 100)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-gray-900">
                    {currency.format(row.amountDue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-gray-700 hidden sm:table-cell">
                    {currency.format(row.amountPaid)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {payable && row.crowdedContact.state === 'matched' ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            disabled={checkoutLoadingId === row.assignmentId}
                            onClick={() => void onCheckout(row.assignmentId, collectionId)}
                          >
                            {checkoutLoadingId === row.assignmentId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5 sm:mr-1" />
                                <span className="hidden sm:inline">Link</span>
                              </>
                            )}
                          </Button>
                          {row.crowdedIntent?.paymentUrl ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() =>
                                onOpenQr({
                                  label: row.fullName || row.email || 'Member',
                                  url: row.crowdedIntent!.paymentUrl!,
                                })
                              }
                            >
                              <QrCode className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-[11px] text-gray-400">Live Crowded data auto-refreshes about every 25 seconds.</p>
    </div>
  );
}
