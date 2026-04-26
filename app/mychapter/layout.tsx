'use client';

import { useState, useEffect } from 'react';
import { DashboardHeader } from '@/components/features/dashboard/DashboardHeader';
import { ModalProvider, useModal } from '@/lib/contexts/ModalContext';
import { ProfileModalProvider, useProfileModal } from '@/lib/contexts/ProfileModalContext';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { EditProfileModal } from '@/components/features/profile/EditProfileModal';
import { EditAlumniProfileModal } from '@/components/features/alumni/EditAlumniProfileModal';
import { UserProfileModal } from '@/components/features/user-profile/UserProfileModal';
import { ProfileService } from '@/lib/services/profileService';
import { ChapterFeaturesProvider } from '@/lib/contexts/ChapterFeaturesContext';
import { ActiveChapterProvider } from '@/lib/contexts/ActiveChapterContext';

export default function MyChapterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ActiveChapterProvider>
    <ChapterFeaturesProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Always show the header */}
        <DashboardHeader />
        
        <main className="flex-1">
          <ModalProvider>
            <ProfileModalProvider>
              {children}
              
              {/* Global Edit Profile Modal - Rendered at layout level */}
              <EditProfileModalWrapper />
              
              {/* Global User Profile Modal - for member card clicks */}
              <UserProfileModalWrapper />
            </ProfileModalProvider>
          </ModalProvider>
        </main>
      </div>
    </ChapterFeaturesProvider>
    </ActiveChapterProvider>
  );
}

// Global Modal Wrapper Component
function EditProfileModalWrapper() {
  const { isEditProfileModalOpen, closeEditProfileModal } = useModal();
  const { profile, refreshProfile } = useProfile();
  const [isMobile, setIsMobile] = useState(false);

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

  if (!profile) return null;

  // Use alumni-specific modal for alumni users
  if (profile.role === 'alumni') {
    return (
      <EditAlumniProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={closeEditProfileModal}
        profile={profile}
        onUpdate={handleProfileUpdate}
        variant={isMobile ? 'mobile' : 'desktop'}
      />
    );
  }

  return (
    <EditProfileModal
      isOpen={isEditProfileModalOpen}
      onClose={closeEditProfileModal}
      profile={profile}
      onUpdate={handleProfileUpdate}
      variant={isMobile ? 'mobile' : 'desktop'}
    />
  );
}

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
