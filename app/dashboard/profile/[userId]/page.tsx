'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { UnifiedUserProfile } from '@/types/user-profile';
import { fetchUserProfile } from '@/lib/services/userProfileService';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { MobileBottomNavigation } from '@/components/features/dashboard/dashboards/ui/MobileBottomNavigation';
import { ProfileSummary } from '@/components/features/user-profile/mobile/ProfileSummary';
import { ContentNavigationTabs } from '@/components/features/profile/mobile/ContentNavigationTabs';
import { PostsTab } from '@/components/features/user-profile/mobile/PostsTab';
import { AboutTab } from '@/components/features/user-profile/mobile/AboutTab';
import { useAuth } from '@/lib/supabase/auth-context';
import { supabase } from '@/lib/supabase/client';
import { DEFAULT_BANNER_IMAGE } from '@/lib/constants';

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const userId = params.userId as string;
  
  const [profile, setProfile] = useState<UnifiedUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('posts');
  const [redirectingToPublicProfile, setRedirectingToPublicProfile] = useState(false);

  useEffect(() => {
    if (!userId) {
      setError('Invalid user ID');
      setLoading(false);
      return;
    }

    async function loadProfile() {
      let isRedirecting = false;
      try {
        setLoading(true);
        setError(null);
        setRedirectingToPublicProfile(false);

        // First, check if profile has a slug for redirect
        const { data: profileData } = await supabase
          .from('profiles')
          .select('profile_slug, username')
          .eq('id', userId)
          .single();

        // If profile has a slug, redirect to the clean URL
        if (profileData?.profile_slug || profileData?.username) {
          const slug = profileData.profile_slug || profileData.username;
          isRedirecting = true;
          setRedirectingToPublicProfile(true);
          router.replace(`/profile/${slug}`, { scroll: false });
          return;
        }

        // Otherwise, load profile normally (backward compatibility)
        const fetchedProfile = await fetchUserProfile(userId);

        if (fetchedProfile) {
          setProfile(fetchedProfile);
          setError(null); // Clear any previous errors
        } else {
          // Only set error after loading completes
          setError('Profile not found');
        }
      } catch (err) {
        console.error('Error loading profile:', err);
        setError('Failed to load profile');
      } finally {
        if (!isRedirecting) {
          setLoading(false);
        }
      }
    }

    loadProfile();
  }, [userId, router]);

  const handleClose = () => {
    router.back(); // Use browser back navigation
  };

  const isOwnProfile = user?.id === userId;

  // Loading state with skeleton loader (include redirect to prevent error flash)
  if (loading || redirectingToPublicProfile) {
    return (
      <div className="min-h-screen bg-white sm:hidden pb-20">
        {/* Banner skeleton */}
        <div className="h-32 bg-gray-200 animate-pulse rounded-t-lg"></div>
        
        {/* Profile content skeleton */}
        <div className="px-4 pt-4 relative">
          {/* Avatar skeleton */}
          <div className="flex justify-center mb-3">
            <div className="w-20 h-20 rounded-full border-4 border-white bg-gray-200 animate-pulse"></div>
          </div>

          {/* Name and info skeleton */}
          <div className="text-center mb-4 space-y-2">
            <div className="h-7 bg-gray-200 rounded w-48 mx-auto animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-32 mx-auto animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-40 mx-auto animate-pulse"></div>
          </div>

          {/* Button skeleton */}
          <div className="mb-4">
            <div className="h-10 bg-gray-200 rounded-full w-full animate-pulse"></div>
          </div>

          {/* Action buttons skeleton */}
          <div className="flex space-x-2 pt-3 border-t border-gray-200">
            <div className="flex-1 h-9 bg-gray-200 rounded-full animate-pulse"></div>
            <div className="flex-1 h-9 bg-gray-200 rounded-full animate-pulse"></div>
          </div>
        </div>

        {/* Tab skeleton */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10 mt-4">
          <div className="flex space-x-4 px-4 py-3">
            <div className="h-5 bg-gray-200 rounded w-16 animate-pulse"></div>
            <div className="h-5 bg-gray-200 rounded w-16 animate-pulse"></div>
          </div>
        </div>

        {/* Content skeleton */}
        <div className="bg-gray-50 min-h-[400px] p-4 space-y-4">
          <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>

        <MobileBottomNavigation />
      </div>
    );
  }

  // Error state - only show AFTER loading completes (never during redirect)
  if (!loading && !redirectingToPublicProfile && (error || !profile)) {
    return (
      <div className="min-h-screen bg-white sm:hidden pb-20">
        {/* Error state with back button */}
        <div className="relative">
          <div className="h-32 relative overflow-hidden">
            <img src={DEFAULT_BANNER_IMAGE} alt="Default banner" className="absolute inset-0 w-full h-full object-cover" />
            {/* Back Button - Positioned in top-left of banner */}
            <button
              onClick={handleClose}
              className="absolute top-3 left-3 z-10 h-10 w-10 rounded-full flex items-center justify-center cursor-pointer group bg-brand-primary hover:bg-brand-primary-hover transition-colors"
              style={{
                boxShadow: `
                  0 6px 12px rgba(0, 0, 0, 0.2),
                  0 2px 4px rgba(0, 0, 0, 0.15),
                  inset 0 1px 0 rgba(255, 255, 255, 0.3),
                  inset 0 -1px 0 rgba(0, 0, 0, 0.2)
                `,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
              title="Go back"
            >
              <div 
                className="absolute inset-0 rounded-full opacity-40"
                style={{
                  background: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4), transparent 70%)',
                }}
              />
              <ArrowLeft 
                className="h-5 w-5 text-white relative z-10 drop-shadow-lg transition-transform duration-200 group-hover:scale-110"
                style={{
                  filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))',
                }}
              />
              <div 
                className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.3), transparent 60%)',
                }}
              />
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-center h-[calc(100vh-200px)] px-4 pt-8">
          <div className="text-center">
            <div className="mb-4">
              <Loader2 className="h-12 w-12 text-red-300 mx-auto mb-4 animate-spin" />
            </div>
            <p className="text-black mb-4 font-medium">{error || 'Profile not found'}</p>
            <Button onClick={handleClose} variant="outline" className="rounded-full">
              Go Back
            </Button>
          </div>
        </div>
        <MobileBottomNavigation />
      </div>
    );
  }

  // Define tabs
  const tabs = [
    { id: 'posts', label: 'Posts' },
    { id: 'about', label: 'About' },
  ];

  // Ensure profile exists before rendering (TypeScript guard)
  if (!profile) {
    return null; // This shouldn't happen due to earlier checks, but satisfies TypeScript
  }

  // Render profile with new structure
  return (
    <div className="min-h-screen bg-white sm:hidden pb-20">
      {/* Profile Summary Section */}
      <ProfileSummary profile={profile} onClose={handleClose} />

      {/* Sticky Tab Navigation */}
      <ContentNavigationTabs 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabs}
        stickyTop="0"
      />

      {/* Scrollable Content Area */}
      <div className="bg-white sm:bg-gray-50 min-h-[400px]">
        {activeTab === 'posts' && (
          <PostsTab userId={userId} isOwnProfile={isOwnProfile} />
        )}
        {activeTab === 'about' && (
          <AboutTab profile={profile} />
        )}
      </div>

      <MobileBottomNavigation />
    </div>
  );
}

