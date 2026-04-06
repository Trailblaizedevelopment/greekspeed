'use client';

import { useState, useCallback, useLayoutEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, UserPlus, ChevronRight } from 'lucide-react';
import type { ChapterMembershipRequest } from '@/types/chapterMembershipRequests';
import type { MembershipRequestChapterGroup } from '@/lib/hooks/useMembershipRequestsAdmin';
import { MembershipRequestDetailSheet } from '@/components/features/dashboard/MembershipRequestDetailSheet';
import { cn } from '@/lib/utils';

function sourceLabel(source: ChapterMembershipRequest['source']): string {
  if (source === 'marketing_alumni') return 'Marketing signup';
  return 'Invitation';
}

export type MembershipRequestDetailSelection = {
  row: ChapterMembershipRequest;
  chapterName: string;
};

interface MembershipRequestsPanelProps {
  groups: MembershipRequestChapterGroup[];
  totalPending: number;
  loading: boolean;
  error: string | null;
  showMultiChapterSummary: boolean;
  /** When false, omit the global “no chapter selected” card (e.g. governance with zero managed chapters handled by parent). */
  showNoChapterCard?: boolean;
  /** TRA-588: open detail sheet from `?request=<uuid>` after server validates access */
  deepLinkDetail?: MembershipRequestDetailSelection | null;
  onDeepLinkConsumed?: () => void;
  approve: (id: string) => Promise<void>;
  reject: (id: string, reason?: string) => Promise<void>;
}

type DetailSelection = MembershipRequestDetailSelection;

export function MembershipRequestsPanel({
  groups,
  totalPending,
  loading,
  error,
  showMultiChapterSummary,
  showNoChapterCard = true,
  deepLinkDetail = null,
  onDeepLinkConsumed,
  approve,
  reject,
}: MembershipRequestsPanelProps) {
  /** TRA-587: optimistically hide rows; rollback on API error */
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DetailSelection | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ChapterMembershipRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const hideOptimistic = useCallback((id: string) => {
    setHiddenIds((prev) => new Set(prev).add(id));
  }, []);

  const unhideOptimistic = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const runApprove = useCallback(
    async (id: string) => {
      hideOptimistic(id);
      setProcessingId(id);
      try {
        await approve(id);
        toast.success('Request approved');
        setSelectedDetail((prev) => (prev?.row.id === id ? null : prev));
      } catch (e) {
        unhideOptimistic(id);
        toast.error(e instanceof Error ? e.message : 'Approve failed');
      } finally {
        setProcessingId(null);
      }
    },
    [approve, hideOptimistic, unhideOptimistic]
  );

  const openRejectFlow = useCallback((row: ChapterMembershipRequest) => {
    setSelectedDetail(null);
    setRejectTarget(row);
    setRejectReason('');
  }, []);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    const reason = rejectReason.trim() || undefined;

    hideOptimistic(id);
    setProcessingId(id);
    try {
      await reject(id, reason);
      toast.success('Request rejected');
      setRejectTarget(null);
      setRejectReason('');
    } catch (e) {
      unhideOptimistic(id);
      toast.error(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setProcessingId(null);
    }
  }, [rejectTarget, rejectReason, reject, hideOptimistic, unhideOptimistic]);

  const visibleInGroup = useCallback(
    (requests: ChapterMembershipRequest[]) =>
      requests.filter((r) => !hiddenIds.has(r.id)),
    [hiddenIds]
  );

  useLayoutEffect(() => {
    if (!deepLinkDetail) return;
    setSelectedDetail(deepLinkDetail);
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-membership-request-row="${deepLinkDetail.row.id}"]`
      );
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    onDeepLinkConsumed?.();
  }, [deepLinkDetail, onDeepLinkConsumed]);

  if (loading && groups.length === 0 && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-600">
        <Loader2 className="h-10 w-10 animate-spin text-brand-primary mb-3" />
        <p className="text-sm">Loading requests…</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6">
          <p className="text-sm text-red-800">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {showMultiChapterSummary && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-gray-700">
            <span className="font-semibold text-gray-900">{totalPending}</span>{' '}
            pending {totalPending === 1 ? 'request' : 'requests'}{' '}
            {groups.length > 1 ? `across ${groups.length} chapters` : ''}
          </p>
        </div>
      )}

      {groups.map((group) => {
        const visible = visibleInGroup(group.requests);
        return (
          <Card key={group.chapterId} className="shadow-sm border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-gray-900 flex flex-wrap items-center gap-2">
                {group.chapterName}
                <span className="text-sm font-normal text-gray-500">
                  ({visible.length} pending)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {group.requests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-gray-500">
                  <UserPlus className="h-10 w-10 text-gray-300 mb-2" />
                  <p className="text-sm font-medium">No pending requests</p>
                  <p className="text-xs mt-1 max-w-sm">
                    New alumni join requests will appear here for this chapter.
                  </p>
                </div>
              ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-gray-500">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-primary mb-2" />
                  <p className="text-sm">Updating list…</p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-600">
                          <th className="pb-2 pr-4 font-medium">Name</th>
                          <th className="pb-2 pr-4 font-medium">Email</th>
                          <th className="pb-2 pr-4 font-medium">Source</th>
                          <th className="pb-2 pr-4 font-medium">Requested</th>
                          <th className="pb-2 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((row) => (
                          <tr
                            key={row.id}
                            data-membership-request-row={row.id}
                            role="button"
                            tabIndex={0}
                            className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50/80 transition-colors"
                            onClick={() =>
                              setSelectedDetail({
                                row,
                                chapterName: group.chapterName,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedDetail({
                                  row,
                                  chapterName: group.chapterName,
                                });
                              }
                            }}
                          >
                            <td className="py-3 pr-4 text-gray-900">
                              {row.applicant_full_name ?? '—'}
                            </td>
                            <td className="py-3 pr-4 text-gray-600">
                              {row.applicant_email ?? '—'}
                            </td>
                            <td className="py-3 pr-4 text-gray-600">
                              {sourceLabel(row.source)}
                            </td>
                            <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">
                              {formatDistanceToNow(new Date(row.created_at), {
                                addSuffix: true,
                              })}
                            </td>
                            <td className="py-3 text-right space-x-2 whitespace-nowrap">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-brand-primary"
                                disabled={!!processingId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDetail({
                                    row,
                                    chapterName: group.chapterName,
                                  });
                                }}
                              >
                                Details
                                <ChevronRight className="h-4 w-4 ml-0.5" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="default"
                                disabled={!!processingId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void runApprove(row.id);
                                }}
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!!processingId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRejectFlow(row);
                                }}
                              >
                                Reject
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <ul className="md:hidden space-y-3">
                    {visible.map((row) => (
                      <li
                        key={row.id}
                        data-membership-request-row={row.id}
                        className="rounded-lg border border-gray-200 bg-gray-50/80 overflow-hidden"
                      >
                        <button
                          type="button"
                          className="w-full text-left p-4 space-y-2 hover:bg-gray-100/60 transition-colors"
                          onClick={() =>
                            setSelectedDetail({
                              row,
                              chapterName: group.chapterName,
                            })
                          }
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <p className="font-medium text-gray-900">
                                {row.applicant_full_name ?? 'Unknown'}
                              </p>
                              <p className="text-sm text-gray-600 break-all">
                                {row.applicant_email ?? '—'}
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                            <span>{sourceLabel(row.source)}</span>
                            <span>
                              {formatDistanceToNow(new Date(row.created_at), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-brand-primary">
                            Tap for details & actions
                          </span>
                        </button>
                        <div className="flex gap-2 px-4 pb-4">
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            className="flex-1"
                            disabled={!!processingId}
                            onClick={() => void runApprove(row.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            disabled={!!processingId}
                            onClick={() => openRejectFlow(row)}
                          >
                            Reject
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {showNoChapterCard && groups.length === 0 && !loading && (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="py-12 text-center text-gray-500">
            <UserPlus className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">No chapter selected</p>
            <p className="text-sm mt-1 max-w-md mx-auto">
              Choose your chapter from the chapter switcher (if available) or ensure your
              profile is linked to a chapter to review membership requests.
            </p>
          </CardContent>
        </Card>
      )}

      <MembershipRequestDetailSheet
        open={!!selectedDetail}
        onOpenChange={(open) => {
          if (!open) setSelectedDetail(null);
        }}
        request={selectedDetail?.row ?? null}
        chapterName={selectedDetail?.chapterName ?? ''}
        processingId={processingId}
        onApprove={(id) => void runApprove(id)}
        onReject={(row) => openRejectFlow(row)}
      />

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open && !processingId) setRejectTarget(null);
        }}
      >
        <DialogContent className={cn('sm:max-w-md')}>
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Optional message for the applicant (stored with the request).
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={3}
            className="resize-none"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectTarget(null)}
              disabled={!!processingId}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => void handleRejectConfirm()}
              disabled={!!processingId}
            >
              {processingId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Confirm reject'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
