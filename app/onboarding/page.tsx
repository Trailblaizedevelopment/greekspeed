'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { Loader2 } from 'lucide-react';
import { STEP_CONFIG } from '@/types/onboarding';
import {
  clearPendingMembershipFlowAcknowledged,
  fetchHasPendingChapterMembershipRequest,
  hasPendingMembershipFlowAcknowledged,
  isAwaitingChapterMembershipApproval,
  setPendingMembershipFlowAcknowledged,
} from '@/lib/utils/marketingAlumniOnboarding';

/**
 * Onboarding entry: dashboard, sign-in, marketing pending (DB + LS), or first step.
 * TRA-582: marketing alumni with a pending chapter_membership_requests row skip role-chapter (refresh-safe).
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  useEffect(() => {
    if (authLoading || profileLoading) return;

    if (!user) {
      router.replace('/sign-in');
      return;
    }

    if (profile?.onboarding_completed) {
      router.replace('/dashboard');
      return;
    }

    if (
      profile?.chapter_id &&
      (profile.signup_channel === 'marketing_alumni' ||
        profile.signup_channel === 'invitation')
    ) {
      router.replace('/dashboard');
      return;
    }

    if (!profile?.id) {
      router.replace(STEP_CONFIG['role-chapter'].path);
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      if (isAwaitingChapterMembershipApproval(profile)) {
        const hasPendingRow = await fetchHasPendingChapterMembershipRequest(profile.id);
        if (cancelled) return;
        if (hasPendingRow) {
          setPendingMembershipFlowAcknowledged(profile.id);
          router.replace('/onboarding/pending-chapter-approval');
          return;
        }
        clearPendingMembershipFlowAcknowledged(profile.id);
      }

      if (cancelled) return;

      if (
        isAwaitingChapterMembershipApproval(profile) &&
        hasPendingMembershipFlowAcknowledged(profile.id)
      ) {
        router.replace('/onboarding/pending-chapter-approval');
        return;
      }

      router.replace(STEP_CONFIG['role-chapter'].path);
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [user, profile, authLoading, profileLoading, router]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-primary mb-4" />
      <p className="text-gray-600">Setting up your profile...</p>
    </div>
  );
}
