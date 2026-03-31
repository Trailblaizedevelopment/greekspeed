'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase/auth-context';
import type { ChapterHealthRow } from '@/types/governance';

interface ChapterHealthResponse {
  rows: ChapterHealthRow[];
}

export function useChapterHealth() {
  const { session, getAuthHeaders } = useAuth();

  return useQuery<ChapterHealthRow[]>({
    queryKey: ['governance', 'chapter-health'],
    queryFn: async () => {
      const headers = getAuthHeaders();
      const response = await fetch('/api/governance/chapter-health', {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch chapter health data');
      }

      const data: ChapterHealthResponse = await response.json();
      return data.rows;
    },
    enabled: !!session?.access_token,
    staleTime: 60_000,
  });
}
