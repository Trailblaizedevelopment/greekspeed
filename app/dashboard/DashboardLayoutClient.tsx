'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { DashboardHeader } from '@/components/features/dashboard/DashboardHeader';
import { useOneSignalPush } from '@/lib/hooks/useOneSignalPush';
import { ModalProvider, useModal } from '@/lib/contexts/ModalContext';
import { ProfileModalProvider, useProfileModal } from '@/lib/contexts/ProfileModalContext';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { EditProfileModal } from '@/components/features/profile/EditProfileModal';
import { EditAlumniProfileModal } from '@/components/features/alumni/EditAlumniProfileModal';
import { UserProfileModal } from '@/components/features/user-profile/UserProfileModal';
import { ProfileService } from '@/lib/services/profileService';
import { ProfileUpdatePromptModal } from '@/components/features/profile/ProfileUpdatePromptModal';
import type { DetectedChange } from '@/components/features/profile/ProfileUpdatePromptModal';
import { useAuth } from '@/lib/supabase/auth-context';
import type { CreatePostRequest } from '@/types/posts';
import { ActiveChapterProvider, useActiveChapter } from '@/lib/contexts/ActiveChapterContext';
import {
  getProfileUpdatePrefs,
  saveProfileUpdatePrefs,
  type ProfileUpdatePrefs,
} from '@/lib/utils/profileUpdatePreferences';
import { getPendingPrompt, clearPendingPrompt, queueProfileUpdatePrompt } from '@/lib/utils/profileUpdatePromptQueue';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  clearPendingMembershipFlowAcknowledged,
  hasPendingMembershipFlowAcknowledged,
  isAwaitingChapterMembershipApproval,
} from '@/lib/utils/marketingAlumniOnboarding';
import { ChapterFeaturesProvider } from '@/lib/contexts/ChapterFeaturesContext';
import { OneSignalDashboardLoader } from '@/components/features/dashboard/OneSignalDashboardLoader';
import { PwaPromptProvider } from '@/lib/contexts/PwaPromptContext';
import { cn } from '@/lib/utils';
import {
  DashboardMessagesMobileChromeProvider,
  useDashboardMessagesMobileChrome,
} from '@/lib/contexts/DashboardMessagesMobileChromeContext';

export default function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading: profileLoading, refreshProfile } = useProfile();

  // Register push subscription so users receive chapter announcements, events, messages, etc.
  useOneSignalPush(profile?.id);
  const router = useRouter();

  /** TRA-583: Do not render dashboard chrome while marketing alumni without chapter are being sent to pending/onboarding. */
  const [marketingDashboardGatePending, setMarketingDashboardGatePending] = useState(false);

  // Guard: incomplete onboarding → wizard entry; pending page only after finishOnboarding sets LS ack.
  // TRA-583: Also gate when onboarding_completed is true but profile is still marketing_alumni without chapter_id (edge case).
  useEffect(() => {
    if (profileLoading || !profile) {
      setMarketingDashboardGatePending(false);
      return;
    }

    const awaiting = isAwaitingChapterMembershipApproval(profile);

    if (profile.onboarding_completed && !awaiting) {
      setMarketingDashboardGatePending(false);
      return;
    }

    if (
      profile.chapter_id &&
      (profile.signup_channel === 'marketing_alumni' ||
        profile.signup_channel === 'invitation')
    ) {
      setMarketingDashboardGatePending(false);
      return;
    }

    let cancelled = false;

    const guard = async () => {
      if (awaiting) {
        setMarketingDashboardGatePending(true);
        if (hasPendingMembershipFlowAcknowledged(profile.id)) {
          if (!cancelled) router.replace('/onboarding/pending-chapter-approval');
          return;
        }
        if (!cancelled) router.replace('/onboarding');
        return;
      }

      setMarketingDashboardGatePending(false);
      if (!cancelled) router.replace('/onboarding');
    };

    void guard();
    return () => {
      cancelled = true;
    };
  }, [profile, profileLoading, router]);

  // Approved marketing alumni: chapter_id set but wizard never flipped onboarding_completed — sync once (exec approval path).
  useEffect(() => {
    if (profileLoading || !profile?.id) return;
    if (profile.onboarding_completed) return;
    if (
      (profile.signup_channel !== 'marketing_alumni' &&
        profile.signup_channel !== 'invitation') ||
      !profile.chapter_id
    )
      return;

    let cancelled = false;
    (async () => {
      const { error } = await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (cancelled || error) return;
      clearPendingMembershipFlowAcknowledged(profile.id);
      await refreshProfile();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    profileLoading,
    profile?.id,
    profile?.onboarding_completed,
    profile?.signup_channel,
    profile?.chapter_id,
    refreshProfile,
  ]);

  if (marketingDashboardGatePending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-brand-primary" aria-hidden />
        <p className="mt-4 text-sm text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <ActiveChapterProvider>
      <GovernanceActiveChapterDefault />
      <MultiMemberActiveChapterDefault />
      <ChapterFeaturesProvider>
        <OneSignalDashboardLoader userId={profile?.id} />
        <PwaPromptProvider userId={profile?.id}>
          <DashboardMessagesMobileChromeProvider>
            {/* min-h-screen allows content to grow so window can scroll; SocialFeed uses useWindowVirtualizer */}
            <DashboardScaffold>{children}</DashboardScaffold>
          </DashboardMessagesMobileChromeProvider>
        </PwaPromptProvider>
      </ChapterFeaturesProvider>
    </ActiveChapterProvider>
  );
}

function DashboardScaffold({ children }: { children: React.ReactNode }) {
  const { mobileMessageThreadFullscreen } = useDashboardMessagesMobileChrome();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className={cn(mobileMessageThreadFullscreen && 'max-md:hidden')}>
        <DashboardHeader />
      </div>

      <main className="flex-1 min-h-0 flex flex-col">
        <ModalProvider>
          <ProfileModalProvider>
            {children}

            <EditProfileModalWrapper />

            <UserProfileModalWrapper />
          </ProfileModalProvider>
        </ModalProvider>
      </main>
    </div>
  );
}

/** Default active chapter to profile chapter for governance so they see their chapter on first load (like developer selecting a chapter). */
function GovernanceActiveChapterDefault() {
  const { profile } = useProfile();
  const { activeChapterId, setActiveChapterId } = useActiveChapter();

  useEffect(() => {
    if (
      profile?.role === 'governance' &&
      profile?.chapter_id &&
      activeChapterId === null
    ) {
      setActiveChapterId(profile.chapter_id);
    }
  }, [profile?.role, profile?.chapter_id, activeChapterId, setActiveChapterId]);

  return null;
}

/**
 * TRA-661: Default active chapter for multi-member users.
 * Restores last-selected space from localStorage, or falls back to profiles.chapter_id.
 */
function MultiMemberActiveChapterDefault() {
  const { profile } = useProfile();
  const { activeChapterId, setActiveChapterId, hasMultipleMemberships } = useActiveChapter();

  useEffect(() => {
    if (!hasMultipleMemberships || !profile?.id || activeChapterId !== null) return;

    // Try to restore from localStorage
    try {
      const stored = localStorage.getItem(`tb:last-active-space:${profile.id}`);
      if (stored) {
        setActiveChapterId(stored);
        return;
      }
    } catch {
      // localStorage unavailable
    }

    // Fall back to primary chapter
    if (profile.chapter_id) {
      setActiveChapterId(profile.chapter_id);
    }
  }, [hasMultipleMemberships, profile?.id, profile?.chapter_id, activeChapterId, setActiveChapterId]);

  return null;
}

// Global Modal Wrapper Component
function EditProfileModalWrapper() {
  const { isEditProfileModalOpen, closeEditProfileModal } = useModal();
  const { profile, refreshProfile } = useProfile();
  const [isMobile, setIsMobile] = useState(false);
  
  // State for profile update prompt modal
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [detectedChanges, setDetectedChanges] = useState<DetectedChange[]>([]);
  const { getAuthHeaders, session } = useAuth();

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleProfileUpdate = async (updatedProfile: any) => {
    try {
      // Update profile data without page reload
      const result = await ProfileService.updateProfile(updatedProfile);
      
      if (result) {
        // Refresh profile data
        await refreshProfile();
        // Close the modal
        closeEditProfileModal();
      }
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  // Handler for when profile is updated with detected changes
  const handleProfileUpdatedWithChanges = (changes: DetectedChange[]) => {
    if (!profile?.id) return;

    // Respect user preference: "don't show again"
    const prefs = getProfileUpdatePrefs(profile.id);
    if (prefs.dontShowAgain) {
      return;
    }

    // If the edit modal is still open, queue and let the existing effect show it after close
    if (isEditProfileModalOpen) {
      queueProfileUpdatePrompt(profile.id, changes);
      return;
    }
    
    // Show the prompt
    setDetectedChanges(changes);
    setShowUpdatePrompt(true);
  };

  // Detect role/member_status transitions coming from outside the edit modals (e.g. admin changes),
  // using localStorage to persist the last-seen values across sessions.
  useEffect(() => {
    if (!profile?.id || typeof window === 'undefined') return;

    let timeoutId: NodeJS.Timeout | null = null;
    let storageListener: ((e: StorageEvent) => void) | null = null;
    let customEventListener: EventListener | null = null;

    const checkAndShowPrompt = () => {
      // Don't show if edit modal is open
      if (isEditProfileModalOpen) {
        return;
      }

      const pending = getPendingPrompt(profile.id);
      if (pending && pending.changes.length > 0) {
        console.log('📬 Found pending prompt, showing after short delay...');
        
        // Reduced delay: 2 seconds after modal closes
        timeoutId = setTimeout(() => {
          // Double-check edit modal is still closed
          if (!isEditProfileModalOpen) {
            handleProfileUpdatedWithChanges(pending.changes);
            clearPendingPrompt(profile.id);
          }
        }, 2000); // 2 second delay
      }
    };

    // Check immediately on mount and when modal closes
    checkAndShowPrompt();

    // Listen for custom event (same-tab detection)
    customEventListener = ((e: Event) => {
      const customEvent = e as CustomEvent<{ userId: string; changes: any[] }>;
      if (customEvent.detail?.userId === profile.id) {
        console.log('📬 Custom event detected - prompt queued');
        // Small delay to ensure modal is closed
        setTimeout(checkAndShowPrompt, 500);
      }
    });

    window.addEventListener('profileUpdatePromptQueued', customEventListener);

    // Also listen for storage events (cross-tab detection)
    storageListener = (e: StorageEvent) => {
      if (e.key === `profile-update-prompt-queue-${profile.id}` && e.newValue) {
        console.log('📬 Storage event detected - prompt queued');
        setTimeout(checkAndShowPrompt, 500);
      }
    };

    window.addEventListener('storage', storageListener);

    // Also check periodically (every 1 second) when modal is closed
    const intervalId = setInterval(() => {
      if (!isEditProfileModalOpen) {
        checkAndShowPrompt();
      }
    }, 1000);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (storageListener) window.removeEventListener('storage', storageListener);
      if (customEventListener) window.removeEventListener('profileUpdatePromptQueued', customEventListener);
      clearInterval(intervalId);
    };
  }, [profile?.id, isEditProfileModalOpen, handleProfileUpdatedWithChanges]);

  
  // Handler for updating user prompt preferences from the modal
  const handleUpdatePromptPrefs = (prefs: ProfileUpdatePrefs) => {
    if (!profile?.id) return;
    saveProfileUpdatePrefs(profile.id, prefs);
  };

  // Handle post creation from prompt modal
  const handleCreatePost = async (content: string) => {
    if (!profile?.chapter_id || !session) {
      throw new Error('Missing required information to create post');
    }

    const headers = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    };

    const metadata: CreatePostRequest['metadata'] = detectedChanges.length > 0 ? {
      profile_update: {
        source: 'profile_update_prompt',
        changed_fields: detectedChanges.map(c => c.field),
        change_types: detectedChanges.map(c => c.type),
      },
    } : undefined;

    const postData: CreatePostRequest = {
      content,
      post_type: 'text',
      ...(metadata && { metadata }),
    };

    const response = await fetch('/api/posts', {
      method: 'POST',
      headers,
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error?.error ?? 'Failed to create post');
    }

    // Post created successfully - close prompt modal AND edit modal
    setShowUpdatePrompt(false);
    setDetectedChanges([]);
    closeEditProfileModal(); // Close the edit modal
  };

  // Handle skip from prompt modal
  const handleSkipPost = () => {
    setShowUpdatePrompt(false);
    setDetectedChanges([]);
    closeEditProfileModal(); // Close the edit modal
  };

  if (!profile) return null;

  // Use alumni-specific modal for alumni users
  if (profile.role === 'alumni') {
    return (
      <>
        <EditAlumniProfileModal
          isOpen={isEditProfileModalOpen}
          onClose={closeEditProfileModal}
          profile={profile}
          onUpdate={handleProfileUpdate}
          variant={isMobile ? 'mobile' : 'desktop'}
          onProfileUpdatedWithChanges={handleProfileUpdatedWithChanges}
        />
        
        {/* Profile Update Prompt Modal */}
        {showUpdatePrompt && detectedChanges.length > 0 && (
          <ProfileUpdatePromptModal
            isOpen={showUpdatePrompt}
            onClose={handleSkipPost}
            onPost={handleCreatePost}
            onSkip={handleSkipPost}
            detectedChanges={detectedChanges}
            userProfile={{
              full_name: profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
              avatar_url: profile.avatar_url,
              chapter: profile.chapter,
            }}
            onUpdatePreferences={handleUpdatePromptPrefs}
            isMobile={isMobile}
          />
        )}
      </>
    );
  }

  // Use regular modal for non-alumni users
  return (
    <>
      <EditProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={closeEditProfileModal}
        profile={profile}
        onUpdate={handleProfileUpdate}
        variant={isMobile ? 'mobile' : 'desktop'}
        onProfileUpdatedWithChanges={handleProfileUpdatedWithChanges}
      />
      
      {/* Profile Update Prompt Modal */}
      {showUpdatePrompt && detectedChanges.length > 0 && (
        <ProfileUpdatePromptModal
          isOpen={showUpdatePrompt}
          onClose={handleSkipPost}
          onPost={handleCreatePost}
          onSkip={handleSkipPost}
          detectedChanges={detectedChanges}
          userProfile={{
            full_name: profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
            avatar_url: profile.avatar_url,
            chapter: profile.chapter,
          }}
          onUpdatePreferences={handleUpdatePromptPrefs}
          isMobile={isMobile}
        />
      )}
    </>
  );
}

// Global User Profile Modal Wrapper Component
function UserProfileModalWrapper() {
  const { isProfileModalOpen, currentProfile, loading, error, closeUserProfile } = useProfileModal();

  return (
    <UserProfileModal
      profile={currentProfile}
      isOpen={isProfileModalOpen}
      onClose={closeUserProfile}
      loading={loading}
      error={error}
    />
  );
}
