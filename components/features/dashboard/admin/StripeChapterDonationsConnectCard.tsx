'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { CreditCard, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/supabase/auth-context';
import { cn } from '@/lib/utils';

export interface StripeChapterDonationsConnectCardProps {
  chapterId: string;
}

type ConnectStatus = {
  stripeConnectAccountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  needsOnboarding: boolean;
  hasAccount: boolean;
};

export function StripeChapterDonationsConnectCard({ chapterId }: StripeChapterDonationsConnectCardProps) {
  const { getAuthHeaders } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handledStripeConnectQuery = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/chapters/${chapterId}/stripe-connect`, {
        method: 'GET',
        headers: {
          ...getAuthHeaders(),
        },
        credentials: 'include',
      });
      const json = (await res.json()) as { data?: ConnectStatus; error?: string };
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to load Stripe Connect status');
      }
      if (!json.data) {
        throw new Error('Invalid response');
      }
      setStatus(json.data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load Stripe Connect status';
      setError(msg);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [chapterId, getAuthHeaders]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const flag = searchParams.get('stripe_connect');
    if (flag !== 'return' && flag !== 'refresh') {
      handledStripeConnectQuery.current = false;
      return;
    }
    if (handledStripeConnectQuery.current) {
      return;
    }
    handledStripeConnectQuery.current = true;
    if (flag === 'return') {
      toast.success('Returned from Stripe. Refreshing connection status…');
    } else {
      toast.info('Stripe link refreshed. Continue onboarding in the new tab if it opened.');
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete('stripe_connect');
    const qs = next.toString();
    router.replace(qs ? `/dashboard/admin?${qs}` : '/dashboard/admin?view=dues');
    void fetchStatus();
  }, [searchParams, router, fetchStatus]);

  const startOnboarding = async () => {
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch(`/api/chapters/${chapterId}/stripe-connect`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { data?: { url: string }; error?: string };
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Could not start Stripe onboarding');
      }
      if (!json.data?.url) {
        throw new Error('Stripe did not return a URL');
      }
      window.location.assign(json.data.url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start Stripe onboarding';
      setError(msg);
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Card
      className={cn(
        'mb-4 sm:mb-6 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20'
      )}
    >
      <CardHeader className="flex flex-col gap-2 border-b border-primary-100/30 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-primary-900 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-brand-primary" />
            Stripe donations (Connect)
          </CardTitle>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">
            Link a Stripe Express account so chapter donations can be collected with Stripe. You will finish
            identity and payout details on Stripe&apos;s secure page.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          disabled={loading}
          onClick={() => void fetchStatus()}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Refreshing
            </>
          ) : (
            'Refresh status'
          )}
        </Button>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
            Loading Stripe Connect status…
          </div>
        )}
        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50/80 p-3 text-sm text-red-800">
            <p className="font-medium">Could not load Stripe Connect</p>
            <p className="mt-1">{error}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void fetchStatus()}>
              Try again
            </Button>
          </div>
        )}
        {!loading && !error && status && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {status.chargesEnabled ? (
                <Badge className="bg-green-100 text-green-900 border-green-200 gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Charges enabled
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-900 border-amber-200 bg-amber-50">
                  Onboarding incomplete
                </Badge>
              )}
              {status.hasAccount ? (
                <span className="text-xs text-gray-500 font-mono truncate max-w-full">
                  Account {status.stripeConnectAccountId}
                </span>
              ) : null}
            </div>
            {status.chargesEnabled ? (
              <p className="text-sm text-gray-700">
                This chapter is ready to accept Stripe-backed donation flows once campaign APIs are enabled.
              </p>
            ) : (
              <p className="text-sm text-gray-700">
                {status.hasAccount
                  ? 'Finish or update your Stripe Express onboarding to enable charges and payouts.'
                  : 'Create a Stripe Express account for this chapter to get started.'}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="rounded-full"
                disabled={actionLoading}
                onClick={() => void startOnboarding()}
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Opening Stripe…
                  </>
                ) : status.chargesEnabled ? (
                  <>
                    Update account in Stripe
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </>
                ) : status.hasAccount ? (
                  <>
                    Continue in Stripe
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </>
                ) : (
                  <>
                    Connect Stripe
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
