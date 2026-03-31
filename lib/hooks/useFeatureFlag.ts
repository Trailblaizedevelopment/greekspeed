import { useChapterFeaturesContext } from '@/lib/contexts/ChapterFeaturesContext';
import { isFeatureEnabled } from '@/types/featureFlags';
import type { FeatureFlagName } from '@/types/featureFlags';


interface UseFeatureFlagResult {
  enabled: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to check if a specific feature flag is enabled for the user's chapter.
 *
 * Uses the shared `ChapterFeaturesContext` so **all** consumers share a single
 * fetch instead of each firing an independent request.
 *
 * @param flagName - The name of the feature flag to check
 * @returns Object with enabled status, loading state, and error state
 *
 * @example
 * const { enabled, loading } = useFeatureFlag('financial_tools_enabled');
 * if (loading) return <Spinner />;
 * if (!enabled) return <FeatureDisabled />;
 */
export function useFeatureFlag(flagName: FeatureFlagName): UseFeatureFlagResult {
  const { flags, loading, error } = useChapterFeaturesContext();

  // Use isFeatureEnabled helper which defaults to true if flags are null/undefined
  const enabled = isFeatureEnabled(flags, flagName);

  return {
    enabled,
    loading,
    error,
  };
}
