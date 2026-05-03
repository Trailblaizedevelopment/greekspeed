'use client';

import { useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import { ExternalLink, HeartHandshake, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { MyDonationCampaignShare } from '@/types/myDonationCampaignShares';
import type { DonationCampaignKind } from '@/types/donationCampaigns';
import { cn } from '@/lib/utils';

function formatUsdFromCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(Number(cents))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents) / 100);
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

function formatSharedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPaidAt(iso: string | null): string {
  if (!iso?.trim()) return '—';
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

export interface DonationShareDetailDrawerProps {
  share: MyDonationCampaignShare;
  isOpen: boolean;
  onClose: () => void;
}

export function DonationShareDetailDrawer({ share, isOpen, onClose }: DonationShareDetailDrawerProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const payUrl = share.checkoutUrl?.trim() || share.crowdedShareUrl?.trim();
  const hasLink = Boolean(payUrl);
  const isChapterPublicBrowse = share.recipientId.startsWith('chapter-public:');
  const hero = share.heroImageUrl?.trim();
  const desc = share.description?.trim();
  const goalCents = share.goalAmountCents;
  const pct = goalProgressPercent(share.campaignTotalRaisedCents, goalCents);
  const requested = formatUsdFromCents(share.requestedAmountCents);

  const drawerContent = (
    <>
      {isMobile ? (
        <div className="mx-auto w-12 h-1.5 shrink-0 rounded-full bg-zinc-300 mt-3 mb-2" />
      ) : null}

      <div className="flex items-start justify-between gap-2 p-4 border-b border-gray-200">
        <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-100 to-white border border-primary-100 flex items-center justify-center shrink-0">
            <HeartHandshake className="h-5 w-5 text-brand-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 leading-tight break-words">{share.title}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span
                className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  'bg-primary-50 text-brand-primary border border-primary-100'
                )}
              >
                {kindLabel(share.kind)}
              </span>
              {share.sharedAt ? (
                <>
                  <span className="text-gray-400 text-xs">•</span>
                  <span className="text-xs text-gray-500">Shared {formatSharedAt(share.sharedAt)}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors shrink-0"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div className={cn('p-4 overflow-y-auto space-y-4', isMobile ? 'max-h-[50dvh]' : 'max-h-[50vh]')}>
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element -- chapter-provided https URL
          <img
            src={hero}
            alt=""
            className="w-full max-h-44 rounded-lg object-cover border border-gray-200"
          />
        ) : null}

        {goalCents != null && Number(goalCents) > 0 ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-600">
              <span>
                <span className="font-medium text-gray-800">{formatUsdFromCents(share.campaignTotalRaisedCents)}</span>{' '}
                raised
              </span>
              <span>
                Goal <span className="font-medium text-gray-800">{formatUsdFromCents(goalCents)}</span>
              </span>
            </div>
            <Progress value={pct} className="h-2" />
            <p className="text-xs text-gray-500">
              {share.campaignPaidRecipientCount} paid · {share.campaignSharedRecipientCount} invited
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            {share.requestedAmountCents != null && Number(share.requestedAmountCents) > 0
              ? `Suggested amount: ${requested}`
              : 'No goal set for this donation.'}
          </p>
        )}

        {(share.myAmountPaidCents != null && share.myAmountPaidCents > 0) || share.myPaidAt ? (
          <div className="rounded-lg border border-primary-100 bg-primary-50/50 px-3 py-2 text-sm text-gray-800">
            <span className="font-medium">Your contribution: </span>
            {share.myAmountPaidCents != null && share.myAmountPaidCents > 0
              ? formatUsdFromCents(share.myAmountPaidCents)
              : 'Recorded'}
            {share.myPaidAt ? (
              <span className="text-gray-600 text-xs block mt-0.5">Paid {formatPaidAt(share.myPaidAt)}</span>
            ) : null}
          </div>
        ) : null}

        {desc ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{desc}</p>
        ) : (
          <p className="text-sm text-gray-500">No description for this donation.</p>
        )}

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contributors</h3>
          {share.contributors.length === 0 ? (
            <p className="text-sm text-gray-500">No recorded payments yet on this donation.</p>
          ) : (
            <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {share.contributors.map((c) => (
                <li
                  key={`${c.profileId}-${c.contributorSource ?? 'member'}`}
                  className="flex justify-between gap-2 text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0"
                >
                  <span className="text-gray-900 truncate">{c.displayName}</span>
                  <span className="shrink-0 text-gray-700 font-medium tabular-nums">
                    {formatUsdFromCents(c.amountPaidCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!hasLink ? (
          <p className="text-xs text-gray-500">
            {isChapterPublicBrowse
              ? 'No pay link is available for this listing yet. Ask your treasurer to confirm the donation has a Stripe Payment Link saved, or to share the donation with you for a personal checkout link.'
              : 'No checkout link yet — ask your treasurer to share this donation with you from Exec Admin so Stripe Checkout can be created for your row.'}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          'shrink-0 p-4 border-t border-gray-200 bg-gray-50',
          isMobile ? 'pb-[calc(1rem+env(safe-area-inset-bottom))]' : ''
        )}
      >
        {hasLink ? (
          <a
            href={payUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: 'default', size: 'lg' }),
              'w-full rounded-full inline-flex items-center justify-center gap-2 no-underline'
            )}
          >
            Open checkout
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <Button type="button" variant="outline" className="w-full rounded-full" disabled>
            Pay link not ready
          </Button>
        )}
      </div>
    </>
  );

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      direction="bottom"
      modal={true}
      dismissible={true}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/40 transition-opacity" />
        <Drawer.Content
          className={cn(
            'bg-white flex flex-col z-[10000] fixed bottom-0 left-0 right-0 shadow-2xl border border-gray-200 outline-none',
            isMobile ? 'max-h-[85dvh] rounded-t-[20px]' : 'max-w-lg mx-auto max-h-[80vh] rounded-t-[20px]'
          )}
        >
          {drawerContent}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
