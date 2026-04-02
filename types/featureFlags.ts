export type FeatureFlagName =
  | 'financial_tools_enabled'
  | 'recruitment_crm_enabled'
  | 'events_management_enabled'
  | 'crowded_integration_enabled';

export interface ChapterFeatureFlags {
  financial_tools_enabled?: boolean;
  recruitment_crm_enabled?: boolean;
  events_management_enabled?: boolean;
  crowded_integration_enabled?: boolean;
}

/**
 * Defaults when merging or returning a full flag object.
 * Core product flags default on; Crowded is opt-in per chapter.
 */
export const DEFAULT_FEATURE_FLAGS: ChapterFeatureFlags = {
  financial_tools_enabled: true,
  recruitment_crm_enabled: true,
  events_management_enabled: true,
  crowded_integration_enabled: false,
};

/** When a flag key is absent from stored JSON, use this (differs for opt-in flags). */
const DEFAULT_WHEN_FLAG_MISSING: Record<FeatureFlagName, boolean> = {
  financial_tools_enabled: true,
  recruitment_crm_enabled: true,
  events_management_enabled: true,
  crowded_integration_enabled: false,
};

// Valid flag names for validation
export const VALID_FEATURE_FLAGS: FeatureFlagName[] = [
  'financial_tools_enabled',
  'recruitment_crm_enabled',
  'events_management_enabled',
  'crowded_integration_enabled',
];

/**
 * Whether a feature is on for the chapter. Uses per-flag defaults when the key
 * is missing or when `flags` is null/undefined (e.g. not loaded yet — Crowded
 * stays off until flags resolve).
 */
export function isFeatureEnabled(
  flags: ChapterFeatureFlags | null | undefined,
  flagName: FeatureFlagName
): boolean {
  if (!flags) {
    return DEFAULT_WHEN_FLAG_MISSING[flagName];
  }
  if (!(flagName in flags)) {
    return DEFAULT_WHEN_FLAG_MISSING[flagName];
  }
  return flags[flagName] === true;
}
