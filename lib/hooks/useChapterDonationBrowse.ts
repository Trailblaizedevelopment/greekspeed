'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase/auth-context';
import type { ChapterDonationBrowseEntry } from '@/types/chapterDonationBrowse';

type ListResponse = { data: ChapterDonationBrowseEntry[] };

export function useChapterDonationBrowse(chapterId: string | null | undefined, enabled: boolean) {
  const { session, getAuthHeaders } = useAuth();
  const cid = chapterId?.trim() ?? '';
  const isEnabled = Boolean(enabled && cid && session?.access_token);

  return useQuery({
    queryKey: ['chapter-donation-browse', cid],
    queryFn: async (): Promise<ChapterDonationBrowseEntry[]> => {
      const res = await fetch(`/api/chapters/${encodeURIComponent(cid)}/donations/browse`, {
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
    refetchInterval: isEnabled ? 12_000 : false,
    refetchIntervalInBackground: false,
  });
}
