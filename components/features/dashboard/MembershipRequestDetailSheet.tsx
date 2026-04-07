'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Loader2, X } from 'lucide-react';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';
import { MembershipRequestEmailMailtoButton } from '@/components/features/dashboard/MembershipRequestEmailMailtoButton';
import type { ChapterMembershipRequest } from '@/types/chapterMembershipRequests';
import { cn } from '@/lib/utils';

function sourceLabel(source: ChapterMembershipRequest['source']): string {
  if (source === 'marketing_alumni') return 'Marketing signup';
  return 'Invitation';
}

export interface MembershipRequestDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ChapterMembershipRequest | null;
  chapterName: string;
  processingId: string | null;
  onApprove: (id: string) => void;
  onReject: (row: ChapterMembershipRequest) => void;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <div className="text-sm text-gray-900 break-words">{value}</div>
    </div>
  );
}

export function MembershipRequestDetailSheet({
  open,
  onOpenChange,
  request,
  chapterName,
  processingId,
  onApprove,
  onReject,
}: MembershipRequestDetailSheetProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!request) return null;

  const busy = processingId === request.id;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction="bottom"
      modal
      dismissible
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/40 transition-opacity" />
        <Drawer.Content
          className={cn(
            'bg-white flex flex-col z-[10000] fixed bottom-0 left-0 right-0 shadow-2xl border border-gray-200 outline-none',
            isMobile
              ? 'max-h-[85dvh] rounded-t-[20px]'
              : 'max-h-[80vh] max-w-lg mx-auto rounded-t-[20px]'
          )}
        >
          {isMobile && (
            <div
              className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mt-3 mb-1"
              aria-hidden
            />
          )}

          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-start justify-between gap-3 px-4 pt-2 sm:pt-4 pb-3 border-b border-gray-100">
              <div className="flex-1 min-w-0 text-left space-y-1">
                <Drawer.Title className="text-lg font-semibold text-gray-900">
                  Membership request
                </Drawer.Title>
                <Drawer.Description className="text-sm font-normal text-gray-500">
                  Review applicant details before approving or rejecting.
                </Drawer.Description>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div
              className={cn(
                'flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-5',
                isMobile ? 'max-h-[50dvh]' : 'max-h-[min(50vh,420px)]'
              )}
            >
              <DetailRow
                label="Applicant"
                value={request.applicant_full_name ?? '—'}
              />
              <DetailRow
                label="Email"
                value={
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{request.applicant_email ?? '—'}</span>
                    <MembershipRequestEmailMailtoButton
                      email={request.applicant_email}
                    />
                  </div>
                }
              />
              <DetailRow label="Chapter" value={chapterName} />
              <DetailRow label="Source" value={sourceLabel(request.source)} />
              <DetailRow
                label="Requested"
                value={format(new Date(request.created_at), 'PPpp')}
              />
              {request.source === 'invitation' && request.invitation_id && (
                <DetailRow
                  label="Invitation ID"
                  value={
                    <span className="font-mono text-xs">{request.invitation_id}</span>
                  }
                />
              )}
            </div>

            <div
              className={cn(
                'flex-shrink-0 border-t border-gray-200 bg-gray-50/80 px-4 py-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end',
                isMobile && 'pb-[calc(1rem+env(safe-area-inset-bottom))]'
              )}
            >
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="w-full sm:w-auto rounded-full"
                onClick={() => onReject(request)}
              >
                Reject
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={busy}
                className="w-full sm:w-auto rounded-full bg-brand-primary"
                onClick={() => onApprove(request.id)}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  'Approve'
                )}
              </Button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
