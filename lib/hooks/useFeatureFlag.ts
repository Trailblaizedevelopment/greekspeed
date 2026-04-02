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
 *
 * Opt-in flags (e.g. `crowded_integration_enabled`) resolve to off until flags load.
 */
export function useFeatureFlag(flagName: FeatureFlagName): UseFeatureFlagResult {
  const { flags, loading, error } = useChapterFeaturesContext();

  const enabled = isFeatureEnabled(flags, flagName);

  return {
    enabled,
    loading,
    error,
  };
}
