import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatureFlag } from './useFeatureFlag';
import type { FeatureFlagName } from '@/types/featureFlags';

interface UseFeatureRedirectOptions {
  /**
   * The name of the feature flag to check
   */
  flagName: FeatureFlagName;
  
  /**
   * The route to redirect to if the feature is disabled.
   * Defaults to '/dashboard'
   */
  redirectTo?: string;
  
  /**
   * Whether to redirect immediately or wait for loading to complete.
   * Defaults to false (waits for loading to complete).
   */
  redirectImmediately?: boolean;
}

/**
 * Hook that redirects users away from a page if a feature flag is disabled.
 * 
 * @param options - Configuration object with flagName and optional redirectTo
 * 
 * @returns Object with loading state and whether the feature is enabled
 * 
 * @example
 * // In a page component
 * export default function DuesPage() {
 *   const { loading } = useFeatureRedirect({ 
 *     flagName: 'financial_tools_enabled',
 *     redirectTo: '/dashboard' 
 *   });
 *   
 *   if (loading) return <div>Loading...</div>;
 *   return <DuesClient />;
 * }
 */
export function useFeatureRedirect(options: UseFeatureRedirectOptions) {
  const { flagName, redirectTo = '/dashboard', redirectImmediately = false } = options;
  const router = useRouter();
  const { enabled, loading, error } = useFeatureFlag(flagName);

  useEffect(() => {
    // Don't redirect while loading (unless redirectImmediately is true)
    if (loading && !redirectImmediately) {
      return;
    }

    // If there's an error, default to allowing access (fail open)
    // This prevents redirects if flag check fails
    if (error) {
      console.warn(`Feature flag check failed for ${flagName}:`, error);
      router.replace(redirectTo);
      return;
    }

    // Redirect if feature is disabled
    if (!enabled) {
      router.push(redirectTo);
    }
  }, [enabled, loading, error, flagName, redirectTo, redirectImmediately, router]);

  return {
    enabled,
    loading,
    error,
  };
}