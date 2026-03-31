export type FeatureFlagName = 
  | 'financial_tools_enabled'
  | 'recruitment_crm_enabled'
  | 'events_management_enabled';

export interface ChapterFeatureFlags {
  financial_tools_enabled?: boolean;
  recruitment_crm_enabled?: boolean;
  events_management_enabled?: boolean;
}

// Default feature flags (all ENABLED by default - matches database)
export const DEFAULT_FEATURE_FLAGS: ChapterFeatureFlags = {
  financial_tools_enabled: true,
  recruitment_crm_enabled: true,
  events_management_enabled: true,
};

// Valid flag names for validation
export const VALID_FEATURE_FLAGS: FeatureFlagName[] = [
  'financial_tools_enabled',
  'recruitment_crm_enabled',
  'events_management_enabled',
];

// Helper function to check if a flag is enabled
// Returns true if flag is missing (default enabled) or explicitly true
export function isFeatureEnabled(
  flags: ChapterFeatureFlags | null | undefined,
  flagName: FeatureFlagName
): boolean {
  if (!flags) return false;
  if (!(flagName in flags)) return false;
  return flags[flagName] === true;
}