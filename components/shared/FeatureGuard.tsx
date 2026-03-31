'use client';

import { ReactNode } from 'react';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import type { FeatureFlagName } from '@/types/featureFlags';

interface FeatureGuardProps {
  /**
   * The name of the feature flag to check
   */
  flagName: FeatureFlagName;
  
  /**
   * Content to render if the feature is enabled
   */
  children: ReactNode;
  
  /**
   * Optional fallback content to render if the feature is disabled.
   * If not provided, nothing is rendered when disabled.
   */
  fallback?: ReactNode;
  
  /**
   * Optional loading component to show while checking the flag.
   * If not provided, nothing is rendered during loading.
   */
  loadingFallback?: ReactNode;
}

/**
 * Component that conditionally renders children based on a feature flag.
 * 
 * @example
 * <FeatureGuard flagName="financial_tools_enabled">
 *   <DuesStatusCard />
 * </FeatureGuard>
 * 
 * @example
 * <FeatureGuard 
 *   flagName="financial_tools_enabled"
 *   fallback={<div>Feature not available</div>}
 * >
 *   <DuesStatusCard />
 * </FeatureGuard>
 */
export function FeatureGuard({ 
  flagName, 
  children, 
  fallback = null,
  loadingFallback = null 
}: FeatureGuardProps) {
  const { enabled, loading, error } = useFeatureFlag(flagName);

  // Show loading state if provided
  if (loading && loadingFallback) {
    return <>{loadingFallback}</>;
  }

  // Don't render anything during loading if no loadingFallback provided
  if (loading) {
    return null;
  }

  // If there's an error, default to showing content (fail open)
  // This prevents features from breaking if flag check fails
  if (error) {
    console.warn(`Feature flag check failed for ${flagName}:`, error);
    return <>{fallback}</>;
  }

  // Render children if enabled, fallback if disabled
  return enabled ? <>{children}</> : <>{fallback}</>;
}