'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase/auth-context';
import type { AlumniIntelligence } from '@/types/governance';

interface UseAlumniIntelligenceOptions {
  chapterIds?: string[];
}

export function useAlumniIntelligence({ chapterIds }: UseAlumniIntelligenceOptions = {}) {
  const { getAuthHeaders } = useAuth();

  return useQuery<AlumniIntelligence>({
    queryKey: ['governance', 'alumni-intelligence', chapterIds ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (chapterIds && chapterIds.length > 0) {
        params.set('chapterIds', chapterIds.join(','));
      }
      const qs = params.toString();
      const url = `/api/governance/alumni-intelligence${qs ? `?${qs}` : ''}`;

      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) {
        throw new Error('Failed to fetch alumni intelligence');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
