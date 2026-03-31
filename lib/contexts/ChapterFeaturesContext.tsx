'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import type { ChapterFeatureFlags } from '@/types/featureFlags';

// ---------------------------------------------------------------------------
// Context that fetches chapter feature flags ONCE and shares the result with
// every `useFeatureFlag` / `<FeatureGuard>` consumer via React context.
//
// Without this, each consumer creates its own `useChapterFeatures` hook,
// which fires an independent `fetch()` to `/api/chapters/{id}/features`.
// On a typical dashboard that meant 8-30+ duplicate calls.
// ---------------------------------------------------------------------------

interface ChapterFeaturesContextValue {
  flags: ChapterFeatureFlags | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const ChapterFeaturesContext = createContext<ChapterFeaturesContextValue>({
  flags: null,
  loading: true,
  error: null,
  refetch: async () => {},
});

export function ChapterFeaturesProvider({ children }: { children: ReactNode }) {
  const { getAuthHeaders, session } = useAuth();
  const { profile } = useProfile();
  const chapterId = profile?.chapter_id ?? null;

  const [flags, setFlags] = useState<ChapterFeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    if (!chapterId || !session) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const headers = getAuthHeaders();
      const response = await fetch(`/api/chapters/${chapterId}/features`, {
        method: 'GET',
        headers,
      });

      let errorMessage = 'Failed to fetch feature flags';
      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } else {
          errorMessage = `Feature flags request failed (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setFlags(data.feature_flags || {});
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch feature flags';
      setError(message);
      console.error('Error fetching feature flags:', err);
      setFlags(null);
    } finally {
      setLoading(false);
    }
  }, [chapterId, session, getAuthHeaders]);

  useEffect(() => {
    if (!chapterId || !session) {
      // Nothing to fetch yet — mark as not-loading so consumers don't block.
      setLoading(false);
      return;
    }

    // Defer by 1 s so critical feed/profile data wins the network race.
    const timerId = setTimeout(() => {
      fetchFlags();
    }, 1000);

    return () => clearTimeout(timerId);
    // Re-run when chapter or session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, session?.access_token]);

  const value = useMemo<ChapterFeaturesContextValue>(
    () => ({ flags, loading, error, refetch: fetchFlags }),
    [flags, loading, error, fetchFlags],
  );

  return (
    <ChapterFeaturesContext.Provider value={value}>
      {children}
    </ChapterFeaturesContext.Provider>
  );
}

/**
 * Hook to consume the shared chapter feature flags from context.
 * Must be used inside a `<ChapterFeaturesProvider>`.
 */
export function useChapterFeaturesContext(): ChapterFeaturesContextValue {
  return useContext(ChapterFeaturesContext);
}
