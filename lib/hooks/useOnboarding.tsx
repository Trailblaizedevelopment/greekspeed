'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { supabase } from '@/lib/supabase/client';
import {
  OnboardingStep,
  OnboardingProgress,
  ONBOARDING_STEPS,
  OAUTH_ONBOARDING_STEPS,
  STEP_CONFIG,
  getNextStep,
  getPreviousStep,
  canAccessStep,
  getEffectiveSteps,
  needsRoleChapterStep,
} from '@/types/onboarding';
import {
  isAwaitingChapterMembershipApproval,
  setPendingMembershipFlowAcknowledged,
} from '@/lib/utils/marketingAlumniOnboarding';

// ============================================================================
// Context Types
// ============================================================================

interface OnboardingContextType {
  // State
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  isComplete: boolean;
  isLoading: boolean;

  // Navigation
  goToStep: (step: OnboardingStep) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;

  // Actions
  completeStep: (step: OnboardingStep) => Promise<void>;
  skipStep: (step: OnboardingStep) => Promise<void>;
  finishOnboarding: () => Promise<void>;

  // Helpers
  canGoBack: boolean;
  canGoForward: boolean;
  progressPercentage: number;
  totalSteps: number;
  currentStepIndex: number;

  // Conditional step info
  needsRoleSelection: boolean;
  effectiveSteps: OnboardingStep[];
}

// ============================================================================
// Context
// ============================================================================

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const router = useRouter();
  const { profile, refreshProfile } = useProfile();

  // Determine if user needs role/chapter selection (OAuth without invitation)
  const needsRoleSelection = needsRoleChapterStep(profile);
  const effectiveSteps = getEffectiveSteps(profile);

  // Set initial step based on whether user needs role selection
  const initialStep: OnboardingStep = needsRoleSelection ? 'role-chapter' : 'profile-basics';

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(initialStep);
  const [completedSteps, setCompletedSteps] = useState<OnboardingStep[]>([]);
  const [skippedSteps, setSkippedSteps] = useState<OnboardingStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  // Load saved progress on mount
  useEffect(() => {
    const loadProgress = async () => {
      if (!profile?.id) {
        setIsLoading(false);
        return;
      }

      try {
        // Check if onboarding is already complete
        if (profile.onboarding_completed) {
          setIsComplete(true);
          setIsLoading(false);
          return;
        }

        // Try to load saved progress from localStorage
        const savedProgress = localStorage.getItem(`onboarding_progress_${profile.id}`);
        if (savedProgress) {
          const progress: OnboardingProgress = JSON.parse(savedProgress);
          setCurrentStep(progress.currentStep);
          setCompletedSteps(progress.completedSteps);
          setSkippedSteps(progress.skippedSteps);
        }
      } catch (error) {
        console.error('Error loading onboarding progress:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadProgress();
  }, [profile?.id, profile?.onboarding_completed]);

  // Save progress whenever it changes
  const saveProgress = useCallback(async (
    step: OnboardingStep,
    completed: OnboardingStep[],
    skipped: OnboardingStep[]
  ) => {
    if (!profile?.id) return;

    const progress: OnboardingProgress = {
      currentStep: step,
      completedSteps: completed,
      skippedSteps: skipped,
      startedAt: new Date().toISOString(),
    };

    // Save to localStorage for quick access
    localStorage.setItem(`onboarding_progress_${profile.id}`, JSON.stringify(progress));
  }, [profile?.id]);

  // Navigate to a specific step
  const goToStep = useCallback((step: OnboardingStep) => {
    if (!canAccessStep(step, completedSteps, skippedSteps, effectiveSteps)) {
      console.warn('Cannot access step:', step);
      return;
    }

    setCurrentStep(step);
    router.push(STEP_CONFIG[step].path);
  }, [completedSteps, skippedSteps, effectiveSteps, router]);

  // Navigate to next step
  const goToNextStep = useCallback(() => {
    const nextStep = getNextStep(currentStep, effectiveSteps);
    if (nextStep) {
      setCurrentStep(nextStep);
      router.push(STEP_CONFIG[nextStep].path);
    }
  }, [currentStep, effectiveSteps, router]);

  // Navigate to previous step
  const goToPreviousStep = useCallback(() => {
    const prevStep = getPreviousStep(currentStep, effectiveSteps);
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(STEP_CONFIG[prevStep].path);
    }
  }, [currentStep, effectiveSteps, router]);

  // Mark step as complete
  const completeStep = useCallback(async (step: OnboardingStep) => {
    const newCompletedSteps = [...completedSteps];
    if (!newCompletedSteps.includes(step)) {
      newCompletedSteps.push(step);
    }

    setCompletedSteps(newCompletedSteps);
    await saveProgress(currentStep, newCompletedSteps, skippedSteps);

    // Auto-advance to next step
    const nextStep = getNextStep(step, effectiveSteps);
    if (nextStep) {
      setCurrentStep(nextStep);
      router.push(STEP_CONFIG[nextStep].path);
    }
  }, [completedSteps, currentStep, skippedSteps, effectiveSteps, saveProgress, router]);

  // Skip optional step
  const skipStep = useCallback(async (step: OnboardingStep) => {
    const config = STEP_CONFIG[step];
    if (!config.optional) {
      console.warn('Cannot skip required step:', step);
      return;
    }

    const newSkippedSteps = [...skippedSteps];
    if (!newSkippedSteps.includes(step)) {
      newSkippedSteps.push(step);
    }

    setSkippedSteps(newSkippedSteps);
    await saveProgress(currentStep, completedSteps, newSkippedSteps);

    // Auto-advance to next step
    const nextStep = getNextStep(step, effectiveSteps);
    if (nextStep) {
      setCurrentStep(nextStep);
      router.push(STEP_CONFIG[nextStep].path);
    }
  }, [skippedSteps, completedSteps, currentStep, effectiveSteps, saveProgress, router]);

  // Finish onboarding
  const finishOnboarding = useCallback(async () => {
    if (!profile?.id) return;

    try {
      // TRA-580: marketing alumni without chapter assignment must not flip onboarding_completed
      // until a chapter admin approves (profiles.chapter_id is set). Avoid dashboard redirect loops.
      if (isAwaitingChapterMembershipApproval(profile)) {
        setPendingMembershipFlowAcknowledged(profile.id);
        localStorage.removeItem(`onboarding_progress_${profile.id}`);
        await refreshProfile();
        router.replace('/onboarding/pending-chapter-approval');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) {
        console.error('Error finishing onboarding:', error);
        throw error;
      }

      localStorage.removeItem(`onboarding_progress_${profile.id}`);

      setIsComplete(true);

      await refreshProfile();

      if (typeof window !== 'undefined') {
        const { setFromOnboarding } = await import('@/lib/utils/pwaPromptStorage');
        setFromOnboarding();
      }

      router.push('/dashboard');
    } catch (error) {
      console.error('Error finishing onboarding:', error);
      throw error;
    }
  }, [profile, refreshProfile, router]);

  // Computed values using effective steps
  const currentStepIndex = effectiveSteps.indexOf(currentStep);
  const totalSteps = effectiveSteps.length - 1; // Exclude 'complete' from count
  const progressPercentage = Math.round((completedSteps.length + skippedSteps.length) / totalSteps * 100);
  const canGoBack = currentStepIndex > 0;
  const canGoForward = currentStepIndex < effectiveSteps.length - 1;

  const value: OnboardingContextType = {
    currentStep,
    completedSteps,
    skippedSteps,
    isComplete,
    isLoading,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    completeStep,
    skipStep,
    finishOnboarding,
    canGoBack,
    canGoForward,
    progressPercentage,
    totalSteps,
    currentStepIndex,
    needsRoleSelection,
    effectiveSteps,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}