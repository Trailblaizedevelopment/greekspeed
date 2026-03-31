import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/supabase/auth-context';
import type { ChapterFeatureFlags } from '@/types/featureFlags';

interface UseChapterFeaturesResult {
  flags: ChapterFeatureFlags | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useChapterFeatures(chapterId: string | null): UseChapterFeaturesResult {
  const { getAuthHeaders, session } = useAuth();
  const [flags, setFlags] = useState<ChapterFeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = async () => {
    if (!chapterId || !session) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const headers = getAuthHeaders(); // This provides Bearer token!
      
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
      const message = err instanceof Error ? err.message : 'Failed to fetch feature flags';
      setError(message);
      console.error('Error fetching feature flags:', err);
      setFlags(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!chapterId || !session) {
      // No data to fetch yet — mark loading as false so FeatureGuard
      // doesn't block indefinitely.
      setLoading(false);
      return;
    }

    // Defer feature-flag fetch by 1s so the critical feed data loads first.
    // Sidebar cards (wrapped in FeatureGuard) render nothing during this
    // brief delay, which is visually acceptable as secondary content.
    const timerId = setTimeout(() => {
      fetchFlags();
    }, 1000);

    return () => clearTimeout(timerId);
  }, [chapterId, session?.access_token]); // Re-fetch if chapterId or session changes

  return {
    flags,
    loading,
    error,
    refetch: fetchFlags,
  };
}