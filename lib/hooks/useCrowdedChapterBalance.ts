'use client';

import { useQuery } from '@tanstack/react-query';
import type { CrowdedChapterBalanceApiResponse } from '@/types/crowdedBalance';

const REFETCH_MS = 60_000;

export function useCrowdedChapterBalance(chapterId: string | null | undefined, enabled: boolean) {
  return useQuery<CrowdedChapterBalanceApiResponse>({
    queryKey: ['crowded-chapter-balance', chapterId],
    queryFn: async () => {
      const res = await fetch(`/api/chapters/${chapterId}/crowded/balance`, {
        credentials: 'include',
      });
      const json = (await res.json()) as CrowdedChapterBalanceApiResponse | { error?: string };

      if (!res.ok) {
        const msg =
          typeof json === 'object' && json && 'error' in json && typeof json.error === 'string'
            ? json.error
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }

      return json as CrowdedChapterBalanceApiResponse;
    },
    enabled: Boolean(chapterId?.trim()) && enabled,
    staleTime: 30_000,
    refetchInterval: REFETCH_MS,
  });
}
