'use client';

import { useQuery } from '@tanstack/react-query';
import type { CrowdedRecentTransactionsApiResponse } from '@/types/crowdedRecentTransactions';

export function useCrowdedRecentTransactions(
  chapterId: string | null | undefined,
  enabled: boolean
) {
  return useQuery<CrowdedRecentTransactionsApiResponse>({
    queryKey: ['crowded-recent-transactions', chapterId],
    queryFn: async () => {
      const res = await fetch(`/api/chapters/${chapterId}/crowded/transactions/recent`, {
        credentials: 'include',
      });
      const json = (await res.json()) as CrowdedRecentTransactionsApiResponse | { error?: string };

      if (!res.ok) {
        const msg =
          typeof json === 'object' && json && 'error' in json && typeof json.error === 'string'
            ? json.error
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }

      return json as CrowdedRecentTransactionsApiResponse;
    },
    enabled: Boolean(chapterId?.trim()) && enabled,
    staleTime: 30_000,
  });
}
