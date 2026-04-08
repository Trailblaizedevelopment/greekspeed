'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { OnboardingProvider } from '@/lib/hooks/useOnboarding';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { ONBOARDING_STEPS, OAUTH_ONBOARDING_STEPS, STEP_CONFIG, OnboardingStep, needsRoleChapterStep } from '@/types/onboarding';

// ============================================================================
// Step Indicator Component
// ============================================================================

interface StepIndicatorProps {
  step: OnboardingStep;
  isActive: boolean;
  isCompleted: boolean;
  isSkipped: boolean;
  stepNumber: number;
  onClick?: () => void;
  isClickable: boolean;
}

function StepIndicator({ step, isActive, isCompleted, isSkipped, stepNumber, onClick, isClickable }: StepIndicatorProps) {
  const config = STEP_CONFIG[step];

  return (
    <div
      className={cn(
        "flex flex-col items-center relative z-10",
        isClickable && "cursor-pointer"
      )}
      onClick={isClickable ? onClick : undefined}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all',
          isCompleted || isSkipped
            ? 'bg-green-500 text-white'
            : isActive
              ? 'bg-brand-primary text-white ring-4 ring-brand-primary/20'
              : 'bg-gray-200 text-gray-500',
          isClickable && 'hover:ring-2 hover:ring-green-300'
        )}
      >
        {isCompleted || isSkipped ? (
          <Check className="h-5 w-5" />
        ) : (
          stepNumber
        )}
      </div>
      <span
        className={cn(
          'mt-2 text-xs font-medium hidden sm:block',
          isActive ? 'text-brand-primary' : 'text-gray-500'
        )}
      >
        {config.title}
      </span>
    </div>
  );
}

// ============================================================================
// Progress Bar Component
// ============================================================================

interface ProgressBarProps {
  currentPath: string;
}

function ProgressBar({ currentPath }: ProgressBarProps) {
  const router = useRouter();
  const { profile } = useProfile();

  /// Determine which steps to show based on profile state
  // If user is on role-chapter step OR has completed it but not finished onboarding,
  // they're in OAuth flow and should see all 5 steps
  const needsRoleStep = needsRoleChapterStep(profile);
  const isOnRoleChapterStep = currentPath.includes('role-chapter');
  const hasCompletedRoleChapter = profile?.role && profile?.chapter && !profile?.onboarding_completed;

  // Show OAuth steps if: needs it, is on it, or completed it but still onboarding
  const effectiveSteps = (needsRoleStep || isOnRoleChapterStep || hasCompletedRoleChapter)
    ? OAUTH_ONBOARDING_STEPS
    : ONBOARDING_STEPS;

  // Determine current step from path
  const getCurrentStep = (): OnboardingStep => {
    if (currentPath.includes('role-chapter')) return 'role-chapter';
    // linkedin-import detection kept for redirect safety, but step is no longer in arrays
    if (currentPath.includes('linkedin-import')) return 'linkedin-import';
    if (currentPath.includes('profile-basics')) return 'profile-basics';
    if (currentPath.includes('profile-photo')) return 'profile-photo';
    if (currentPath.includes('notifications')) return 'notifications';
    if (currentPath.includes('complete')) return 'complete';
    return needsRoleStep ? 'role-chapter' : 'linkedin-import';
  };

  const currentStep = getCurrentStep();
  const currentIndex = effectiveSteps.indexOf(currentStep);

  // Filter out 'complete' from displayed steps
  const displaySteps = effectiveSteps.filter(s => s !== 'complete');

  const handleStepClick = (step: OnboardingStep) => {
    router.push(STEP_CONFIG[step].path);
  };

  // Calculate progress width
  const progressWidth = currentIndex >= 0
    ? (currentIndex / Math.max(displaySteps.length - 1, 1)) * 100
    : 0;

  return (
    <div className="w-full">
      <div className="relative flex items-center justify-between">
        {/* Connector lines */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200" />
        <div
          className="absolute top-5 left-0 h-0.5 bg-green-500 transition-all duration-300"
          style={{ width: `${progressWidth}%` }}
        />

        {/* Step indicators */}
        {displaySteps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isActive = step === currentStep;
          // Allow clicking on completed steps to go back
          const isClickable = isCompleted;

          return (
            <StepIndicator
              key={step}
              step={step}
              stepNumber={index + 1}
              isActive={isActive}
              isCompleted={isCompleted}
              isSkipped={false}
              isClickable={isClickable}
              onClick={() => handleStepClick(step)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Layout Component
// ============================================================================

interface OnboardingLayoutClientProps {
  children: ReactNode;
}

export default function OnboardingLayoutClient({ children }: OnboardingLayoutClientProps) {
  const pathname = usePathname();
  const { profile } = useProfile();

  useEffect(() => {
    document.documentElement.dataset.onboarding = 'true';
    return () => {
      delete document.documentElement.dataset.onboarding;
    };
  }, []);

  // Don't show progress bar on the main onboarding page (redirect page)
  // Also hide for users who have completed onboarding and are using prefill-profile (profile editing flow)
  const isProfileEditFlow = pathname.includes('/prefill-profile') && profile?.onboarding_completed === true;
  const showProgressBar =
    pathname !== '/onboarding' &&
    !pathname.includes('/complete') &&
    !pathname.includes('/membership-pending') &&
    !pathname.includes('/pending-chapter-approval') &&
    !isProfileEditFlow;

  return (
    <OnboardingProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-accent-50">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-primary/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10">
          {/* Header with progress */}
          {showProgressBar && (
            <header className="py-6 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
              <div className="w-full max-w-none sm:max-w-2xl sm:mx-auto px-3 sm:px-6">
                <div className="text-center mb-4">
                  <h1 className="text-lg font-semibold text-gray-900">
                    Complete Your Profile
                  </h1>
                  <p className="text-sm text-gray-500">
                    Just a few more steps to get started
                  </p>
                </div>
                <ProgressBar currentPath={pathname} />
              </div>
            </header>
          )}

          {/* Main: full width on mobile, centered max-w-2xl from sm up */}
          <main className="py-6 sm:py-8 px-3 sm:px-6 lg:px-8">
            <div className="w-full max-w-none sm:max-w-2xl sm:mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </OnboardingProvider>
  );
}
