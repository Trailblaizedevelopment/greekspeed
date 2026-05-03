'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { HeartHandshake, ExternalLink } from 'lucide-react';
import { useMyDonationCampaignShares } from '@/lib/hooks/useMyDonationCampaignShares';
import type { DonationCampaignKind } from '@/types/donationCampaigns';
import { cn } from '@/lib/utils';

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

export function MyDonationSharesCard() {
  const { data = [], isLoading, isError, error, refetch, isFetching } = useMyDonationCampaignShares(true);

  return (
    <Card className="rounded-xl border border-gray-200 bg-white shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <HeartHandshake className="h-5 w-5 text-brand-primary shrink-0" />
          Donations for you
        </CardTitle>
        <p className="text-sm text-gray-500 font-normal">
          Campaigns your chapter shared with you. Open the pay link when your treasurer has added one (Stripe or
          Crowded).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
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
          <p className="text-sm text-gray-600">
            No donation campaigns have been shared with you yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((row) => {
              const goal = formatUsdFromCents(row.goalAmountCents);
              const requested = formatUsdFromCents(row.requestedAmountCents);
              const payUrl = row.checkoutUrl?.trim() || row.crowdedShareUrl?.trim();
              const hasLink = Boolean(payUrl);
              const isStripe = row.paymentProvider === 'stripe';

              return (
                <li
                  key={row.recipientId}
                  className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-gray-900 text-sm leading-snug">{row.title}</p>
                    <span
                      className={cn(
                        'shrink-0 text-xs font-medium px-2 py-0.5 rounded-full',
                        'bg-primary-50 text-brand-primary border border-primary-100'
                      )}
                    >
                      {kindLabel(row.kind)}
                    </span>
                  </div>
                  {(goal || requested) && (
                    <p className="text-xs text-gray-600">
                      {requested && (
                        <>
                          Suggested: <span className="font-medium text-gray-800">{requested}</span>
                        </>
                      )}
                      {requested && goal ? ' · ' : null}
                      {goal && (
                        <>
                          Goal: <span className="font-medium text-gray-800">{goal}</span>
                        </>
                      )}
                    </p>
                  )}
                  {hasLink ? (
                    <a
                      href={payUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                        'w-full sm:w-auto inline-flex items-center justify-center gap-2 no-underline'
                      )}
                    >
                      {isStripe ? 'Open Stripe checkout' : 'Open in Crowded'}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <p className="text-xs text-gray-500">
                      {isStripe
                        ? 'No checkout link yet — ask your treasurer to use Create link on your row in the donation drive.'
                        : 'No Crowded checkout link on this campaign yet — your treasurer can add one or you may pay from your Crowded account when a collect request appears.'}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!isLoading && data.length > 0 && isFetching && (
          <p className="text-xs text-gray-400">Refreshing…</p>
        )}
      </CardContent>
    </Card>
  );
}
