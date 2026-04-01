'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase/auth-context';
import type { EngagementMetricsResponse } from '@/types/engagement';

interface UseEngagementMetricsOptions {
  chapterId?: string;
  windowDays?: number;
  topN?: number;
  enabled?: boolean;
}

export function useEngagementMetrics(
  options: UseEngagementMetricsOptions = {}
) {
  const { session, getAuthHeaders } = useAuth();
  const { chapterId, windowDays = 30, topN = 10, enabled = true } = options;

  return useQuery<EngagementMetricsResponse>({
    queryKey: ['engagement-metrics', chapterId, windowDays, topN],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (chapterId) params.set('chapterId', chapterId);
      params.set('windowDays', String(windowDays));
      params.set('topN', String(topN));

      const response = await fetch(
        `/api/engagement-metrics?${params.toString()}`,
        { headers: getAuthHeaders() }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to fetch engagement metrics');
      }

      return response.json();
    },
    enabled: !!session?.access_token && enabled,
    staleTime: 60_000,
  });
}
