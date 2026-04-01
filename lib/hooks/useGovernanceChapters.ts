'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase/auth-context';

interface GovernanceChapter {
  id: string;
  name: string;
}

interface GovernanceChaptersResponse {
  chapterIds: string[];
  chapters: GovernanceChapter[];
}

export function useGovernanceChapters() {
  const { getAuthHeaders } = useAuth();

  return useQuery<GovernanceChaptersResponse>({
    queryKey: ['governance', 'chapters'],
    queryFn: async () => {
      const res = await fetch('/api/me/governance-chapters', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch governance chapters');
      }
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}
