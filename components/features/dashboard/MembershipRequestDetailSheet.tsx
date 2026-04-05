'use client';

import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  if (!request) return null;

  const busy = processingId === request.id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          'w-full max-w-lg sm:max-w-xl overflow-y-auto flex flex-col p-0'
        )}
        side="right"
      >
        <div className="flex flex-col flex-1 min-h-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100 text-left space-y-1">
            <SheetTitle className="text-lg">Membership request</SheetTitle>
            <p className="text-sm font-normal text-gray-500">
              Review applicant details before approving or rejecting.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <DetailRow
              label="Applicant"
              value={request.applicant_full_name ?? '—'}
            />
            <DetailRow label="Email" value={request.applicant_email ?? '—'} />
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
            <DetailRow
              label="User ID"
              value={<span className="font-mono text-xs">{request.user_id}</span>}
            />
            <DetailRow
              label="Request ID"
              value={<span className="font-mono text-xs">{request.id}</span>}
            />
          </div>

          <div className="border-t border-gray-200 bg-gray-50/80 px-6 py-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onReject(request)}
            >
              Reject
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={busy}
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
      </SheetContent>
    </Sheet>
  );
}
