import { z } from 'zod';

// ============================================================================
// Onboarding Step Definitions
// ============================================================================

export type OnboardingStep =
  | 'role-chapter'      // Conditional step for OAuth users without role/chapter
  | 'linkedin-import'
  | 'profile-basics'
  | 'profile-photo'
  | 'notifications'
  | 'complete';

// Base steps for email signup users (already have role/chapter from profile-basics)
export const ONBOARDING_STEPS: OnboardingStep[] = [
  //'linkedin-import',
  'profile-basics',
  'profile-photo',
  'notifications',
  'complete',
];

// Steps for OAuth users without invitation (need to select role/chapter first)
export const OAUTH_ONBOARDING_STEPS: OnboardingStep[] = [
  'role-chapter',
  //'linkedin-import',
  'profile-basics',
  'profile-photo',
  'notifications',
  'complete',
];

export const STEP_CONFIG: Record<OnboardingStep, {
  title: string;
  description: string;
  path: string;
  optional: boolean;
  order: number;
}> = {
  'role-chapter': {
    title: 'Get Started',
    description: 'Select your chapter',
    path: '/onboarding/steps/role-chapter',
    optional: false,
    order: 0,
  },
  'linkedin-import': {
    title: 'Import from LinkedIn',
    description: 'Quickly fill your profile',
    path: '/onboarding/steps/linkedin-import',
    optional: true,
    order: 1,
  },
  'profile-basics': {
    title: 'Profile Basics',
    description: 'Tell us about yourself',
    path: '/onboarding/steps/profile-basics',
    optional: false,
    order: 2,
  },
  'profile-photo': {
    title: 'Profile Photo',
    description: 'Add a profile picture',
    path: '/onboarding/steps/profile-photo',
    optional: true,
    order: 3,
  },
  'notifications': {
    title: 'Notifications',
    description: 'Set your preferences',
    path: '/onboarding/steps/notifications',
    optional: false,
    order: 4,
  },
  'complete': {
    title: 'All Done!',
    description: 'Welcome to Trailblaize',
    path: '/onboarding/complete',
    optional: false,
    order: 5,
  },
};

// ============================================================================
// Onboarding State
// ============================================================================

export interface OnboardingState {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  isComplete: boolean;
}

export interface OnboardingProgress {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  startedAt: string;
  completedAt?: string;
}

// ============================================================================
// Profile Basics Form Data
// ============================================================================

export interface ProfileBasicsFormData {
  firstName: string;
  lastName: string;
  chapter: string;
  chapterId: string;
  role: 'alumni' | 'active_member';
  graduationYear: number;
  major: string;
  // Alumni-specific fields
  company?: string;
  jobTitle?: string;
  industry?: string;
  location?: string;
}

export const profileBasicsSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  chapter: z.string().min(1, 'Chapter is required'),
  chapterId: z.string().min(1, 'Chapter ID is required'),
  role: z.enum(['alumni', 'active_member']),
  graduationYear: z.number()
    .min(1950, 'Invalid graduation year')
    .max(new Date().getFullYear() + 10, 'Invalid graduation year'),
  major: z.string().min(1, 'Major is required'),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
});

// ============================================================================
// Notification Preferences
// ============================================================================

export interface NotificationPreferences {
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  // Specific notification types
  connectionRequests: boolean;
  messages: boolean;
  announcements: boolean;
  events: boolean;
  weeklyDigest: boolean;
}

export const notificationPreferencesSchema = z.object({
  emailNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  connectionRequests: z.boolean(),
  messages: z.boolean(),
  announcements: z.boolean(),
  events: z.boolean(),
  weeklyDigest: z.boolean(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the step index within a given steps array
 */
export function getStepIndex(step: OnboardingStep, steps: OnboardingStep[] = ONBOARDING_STEPS): number {
  return steps.indexOf(step);
}

/**
 * Get the next step in the sequence
 */
export function getNextStep(currentStep: OnboardingStep, steps: OnboardingStep[] = ONBOARDING_STEPS): OnboardingStep | null {
  const currentIndex = getStepIndex(currentStep, steps);
  if (currentIndex === -1 || currentIndex >= steps.length - 1) {
    return null;
  }
  return steps[currentIndex + 1];
}

/**
 * Get the previous step in the sequence
 */
export function getPreviousStep(currentStep: OnboardingStep, steps: OnboardingStep[] = ONBOARDING_STEPS): OnboardingStep | null {
  const currentIndex = getStepIndex(currentStep, steps);
  if (currentIndex <= 0) {
    return null;
  }
  return steps[currentIndex - 1];
}

/**
 * Check if a step is complete (completed or skipped)
 */
export function isStepComplete(
  step: OnboardingStep,
  completedSteps: OnboardingStep[],
  skippedSteps: OnboardingStep[]
): boolean {
  return completedSteps.includes(step) || skippedSteps.includes(step);
}

/**
 * Check if user can access a specific step
 */
export function canAccessStep(
  step: OnboardingStep,
  completedSteps: OnboardingStep[],
  skippedSteps: OnboardingStep[],
  steps: OnboardingStep[] = ONBOARDING_STEPS
): boolean {
  const stepIndex = getStepIndex(step, steps);
  if (stepIndex === 0) return true;
  if (stepIndex === -1) return false;

  // Check all previous steps are complete or skipped
  for (let i = 0; i < stepIndex; i++) {
    const prevStep = steps[i];
    if (!isStepComplete(prevStep, completedSteps, skippedSteps)) {
      return false;
    }
  }
  return true;
}

/**
 * Determine if user needs role/chapter selection (OAuth without invitation)
 * Note: Even if user already has role/chapter (from invitation), we still show
 * the role-chapter step in "confirmation mode" for a unified 5-step experience.
 */
export function needsRoleChapterStep(profile: { role?: string | null; chapter?: string | null } | null): boolean {
  return !profile?.role || !profile?.chapter;
}

/**
 * Check if user has completed the role-chapter step (has both role and chapter set)
 */
export function hasCompletedRoleChapter(profile: { role?: string | null; chapter?: string | null } | null): boolean {
  return !!(profile?.role && profile?.chapter);
}

/**
 * Get the effective steps array based on user state
 * Always returns all 5 steps for a unified onboarding experience.
 * Users with role/chapter already set (from invitation) will see a confirmation mode.
 */
export function getEffectiveSteps(profile: { role?: string | null; chapter?: string | null } | null): OnboardingStep[] {
  // Always return the full 5-step flow for unified experience
  // The role-chapter page handles showing confirmation mode if data already exists
  return OAUTH_ONBOARDING_STEPS;
}
