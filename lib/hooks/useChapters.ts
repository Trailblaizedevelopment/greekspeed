import { useQuery } from '@tanstack/react-query';
import { Chapter } from '@/types/chapter';

const STALE_MS = 10 * 60 * 1000;

/** Stable reference when the query has no data yet (avoids infinite effect loops). */
const EMPTY_CHAPTERS: Chapter[] = [];

export function useChapters() {
  const { data, isPending: loading, error } = useQuery<Chapter[]>({
    queryKey: ['chapters'],
    queryFn: async () => {
      const response = await fetch('/api/chapters');
      if (!response.ok) {
        throw new Error('Failed to fetch chapters');
      }
      return response.json();
    },
    staleTime: STALE_MS,
    retry: false,
  });

  const chapters = data ?? EMPTY_CHAPTERS;

  return {
    chapters,
    loading,
    error: error instanceof Error ? error.message : null,
  };
}
