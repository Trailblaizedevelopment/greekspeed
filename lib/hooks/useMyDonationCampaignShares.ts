'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase/auth-context';
import type { MyDonationCampaignShare } from '@/types/myDonationCampaignShares';

type ListResponse = { data: MyDonationCampaignShare[] };

/** Foreground poll so goal / contributors update soon after Stripe webhook without waiting on staleTime. */
const REFETCH_INTERVAL_MS = 10_000;

export function useMyDonationCampaignShares(enabled: boolean) {
  const { session, getAuthHeaders } = useAuth();
  const queryClient = useQueryClient();
  const isEnabled = Boolean(enabled && session?.access_token);

  const query = useQuery({
    queryKey: ['my-donation-campaign-shares'],
    queryFn: async (): Promise<MyDonationCampaignShare[]> => {
      const res = await fetch('/api/me/donation-campaign-shares', {
        headers: getAuthHeaders(),
      });
      const json = (await res.json()) as ListResponse | { error?: string };

      if (!res.ok) {
        const msg =
          typeof json === 'object' && json && 'error' in json && typeof json.error === 'string'
            ? json.error
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }

      return Array.isArray((json as ListResponse).data) ? (json as ListResponse).data : [];
    },
    enabled: isEnabled,
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: true,
    refetchInterval: isEnabled ? REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });

  // Same-window tab return (e.g. Stripe checkout tab → dashboard tab) does not always fire window focus.
  useEffect(() => {
    if (!isEnabled) return;

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ queryKey: ['my-donation-campaign-shares'] });
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isEnabled, queryClient]);

  return query;
}
