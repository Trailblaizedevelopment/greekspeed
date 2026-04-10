'use client';

import { useQuery } from '@tanstack/react-query';
import type { CrowdedCollectOverviewApiResponse } from '@/types/crowdedCollectOverview';

const REFETCH_MS = 25_000;

export function useCrowdedCollectOverview(
  chapterId: string | null | undefined,
  collectionId: string | null | undefined,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['crowded-collect-overview', chapterId, collectionId],
    queryFn: async () => {
      const cid = collectionId!.trim();
      const res = await fetch(
        `/api/chapters/${chapterId}/crowded/collections/${encodeURIComponent(cid)}/overview`,
        { credentials: 'include' }
      );
      const json = (await res.json()) as CrowdedCollectOverviewApiResponse;
      if (!res.ok) {
        const msg = !json.ok && 'error' in json ? json.error : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      if (!json.ok) {
        throw new Error(json.error);
      }
      return json;
    },
    enabled: Boolean(chapterId?.trim() && collectionId?.trim()) && enabled,
    refetchInterval: enabled ? REFETCH_MS : false,
    staleTime: 12_000,
  });
}
