'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase/auth-context';
import type { MyDonationCampaignShare } from '@/types/myDonationCampaignShares';

type ListResponse = { data: MyDonationCampaignShare[] };

export function useMyDonationCampaignShares(enabled: boolean) {
  const { session, getAuthHeaders } = useAuth();

  return useQuery({
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
    enabled: Boolean(enabled && session?.access_token),
    staleTime: 30_000,
  });
}
