'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useOnboarding } from '@/lib/hooks/useOnboarding';
import { AvatarService } from '@/lib/services/avatarService';
import { BannerService } from '@/lib/services/bannerService';
import { ONBOARDING_MAIN_CARD_CLASS } from '@/lib/constants/onboardingUi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Camera,
  Upload,
  X,
  Loader2,
  ChevronRight,
  ChevronLeft,
  User,
  ImagePlus,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';

// ============================================================================
// Component
// ============================================================================

export default function ProfilePhotoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, updateProfile, refreshProfile } = useProfile();
  const { completeStep, skipStep, goToPreviousStep } = useOnboarding();

  // Avatar state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isAvatarDragging, setIsAvatarDragging] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [navigating, setNavigating] = useState(false);

  // Banner state
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [isBannerDragging, setIsBannerDragging] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Combined uploading state
  const uploading = avatarUploading || bannerUploading;
  const isDisabled = uploading || navigating;

  // Get initials for avatar fallback
  const getInitials = () => {
    const first = profile?.first_name?.[0] || '';
    const last = profile?.last_name?.[0] || '';
    return (first + last).toUpperCase() || 'U';
  };


  // Current URLs (preview or existing)
  // Check profile first, then fall back to OAuth metadata if available
  const oauthAvatarUrl = user?.user_metadata?.picture || user?.user_metadata?.avatar_url || null;
  const currentAvatarUrl = avatarPreviewUrl || profile?.avatar_url || oauthAvatarUrl;
  const currentBannerUrl = bannerPreviewUrl || profile?.banner_url;

  // Save OAuth avatar to profile if it exists in metadata but not in profile
  useEffect(() => {
    if (oauthAvatarUrl && !profile?.avatar_url && user?.id) {
      // OAuth avatar exists but not saved to profile - save it
      const saveOAuthAvatar = async () => {
        try {
          await updateProfile({ avatar_url: oauthAvatarUrl });
          await refreshProfile();
        } catch (error) {
          console.warn('Failed to save OAuth avatar to profile:', error);
          // Don't show error to user - avatar will still display from metadata
        }
      };
      saveOAuthAvatar();
    }
  }, [oauthAvatarUrl, profile?.avatar_url, user?.id, updateProfile, refreshProfile]);

  // ============================================================================
  // Avatar Handlers
  // ============================================================================

  const handleAvatarFileChange = useCallback(async (file: File) => {
    if (!file || !user?.id) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please select a JPEG, PNG, or GIF image');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setAvatarUploading(true);
    try {
      const newAvatarUrl = await AvatarService.uploadAvatar(file, user.id);

      if (newAvatarUrl) {
        if (profile?.avatar_url && !profile.avatar_url.includes('googleusercontent')) {
          await AvatarService.deleteOldAvatar(profile.avatar_url);
        }

        await AvatarService.updateProfileAvatar(user.id, newAvatarUrl);
        await updateProfile({ avatar_url: newAvatarUrl });
        setAvatarPreviewUrl(newAvatarUrl);
        await refreshProfile();
        toast.success('Profile photo uploaded!');
      } else {
        throw new Error('Failed to upload');
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload photo. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  }, [user?.id, profile?.avatar_url, updateProfile, refreshProfile]);

  const handleAvatarInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAvatarFileChange(file);
  };

  const handleAvatarDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsAvatarDragging(true);
  };

  const handleAvatarDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsAvatarDragging(false);
  };

  const handleAvatarDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsAvatarDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleAvatarFileChange(file);
  };

  const handleRemoveAvatar = async () => {
    if (!user?.id) return;

    setAvatarUploading(true);
    try {
      if (profile?.avatar_url) {
        await AvatarService.deleteOldAvatar(profile.avatar_url);
      }
      await AvatarService.updateProfileAvatar(user.id, null);
      await updateProfile({ avatar_url: null });
      setAvatarPreviewUrl(null);
      await refreshProfile();
      toast.success('Photo removed');
    } catch (error) {
      console.error('Error removing avatar:', error);
      toast.error('Failed to remove photo');
    } finally {
      setAvatarUploading(false);
    }
  };

  // ============================================================================
  // Banner Handlers
  // ============================================================================

  const handleBannerFileChange = useCallback(async (file: File) => {
    if (!file || !user?.id) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please select a JPEG, PNG, or GIF image');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Banner file size must be less than 10MB');
      return;
    }

    setBannerUploading(true);
    try {
      const newBannerUrl = await BannerService.uploadBanner(file, user.id);

      if (newBannerUrl) {
        if (profile?.banner_url) {
          BannerService.deleteOldBanner(profile.banner_url).catch(err =>
            console.error('Error deleting old banner:', err)
          );
        }

        await BannerService.updateProfileBanner(user.id, newBannerUrl);
        await updateProfile({ banner_url: newBannerUrl });
        setBannerPreviewUrl(newBannerUrl);
        toast.success('Banner uploaded!');
      } else {
        throw new Error('Failed to upload banner');
      }
    } catch (error) {
      console.error('Error uploading banner:', error);
      toast.error('Failed to upload banner. Please try again.');
    } finally {
      setBannerUploading(false);
    }
  }, [user?.id, profile?.banner_url, updateProfile]);

  const handleBannerInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleBannerFileChange(file);
  };

  const handleBannerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsBannerDragging(true);
  };

  const handleBannerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsBannerDragging(false);
  };

  const handleBannerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsBannerDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleBannerFileChange(file);
  };

  const handleRemoveBanner = async () => {
    if (!user?.id) return;

    setBannerUploading(true);
    try {
      if (profile?.banner_url) {
        await BannerService.deleteOldBanner(profile.banner_url);
      }
      await BannerService.updateProfileBanner(user.id, null);
      await updateProfile({ banner_url: null });
      setBannerPreviewUrl(null);
      toast.success('Banner removed');
    } catch (error) {
      console.error('Error removing banner:', error);
      toast.error('Failed to remove banner');
    } finally {
      setBannerUploading(false);
    }
  };

  // ============================================================================
  // Navigation Handlers
  // ============================================================================

  const handleContinue = async () => {
    setNavigating(true);
    try {
      await completeStep('profile-photo');
    } catch (error) {
      console.error('Error completing step:', error);
      setNavigating(false);
    }
  };

  const handleSkip = async () => {
    setNavigating(true);
    try {
      await skipStep('profile-photo');
    } catch (error) {
      console.error('Error skipping step:', error);
      setNavigating(false);
    }
  };

  const handleBack = () => {
    goToPreviousStep();
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Profile Photo Card */}
      <Card className={ONBOARDING_MAIN_CARD_CLASS}>
        <CardHeader className="text-center pb-2">
          <CardTitle className="flex items-center justify-center gap-2">
            Add Your Photos
          </CardTitle>
          <CardDescription>
            Personalize your profile with a photo and banner
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* ============== PROFILE PHOTO SECTION ============== */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile Photo
            </h3>
            
            {/* Avatar Preview */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="h-32 w-32 border-4 border-white shadow-lg">
                  <AvatarImage src={currentAvatarUrl || undefined} />
                  <AvatarFallback className="text-3xl bg-gradient-to-br from-brand-primary to-brand-primary-dark text-white">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                
                {!avatarUploading && (
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Camera className="h-8 w-8 text-white" />
                  </button>
                )}

                {avatarUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                    <Loader2 className="h-8 w-8 text-white animate-spin" />
                  </div>
                )}

                {currentAvatarUrl && !avatarUploading && (
                  <button
                    onClick={handleRemoveAvatar}
                    className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-md transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <p className="text-sm text-gray-500">
                {currentAvatarUrl ? 'Click to change photo' : 'No photo yet'}
              </p>
            </div>

            {/* Avatar Drag and Drop Zone */}
            <div
              onDragOver={handleAvatarDragOver}
              onDragLeave={handleAvatarDragLeave}
              onDrop={handleAvatarDrop}
              onClick={() => avatarInputRef.current?.click()}
              className={cn(
                'mt-4 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
                isAvatarDragging
                  ? 'border-brand-primary bg-brand-primary/5'
                  : 'border-gray-300 hover:border-brand-primary hover:bg-gray-50',
                avatarUploading && 'pointer-events-none opacity-50'
              )}
            >
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif"
                onChange={handleAvatarInputChange}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2">
                <ImagePlus className="h-6 w-6 text-gray-400" />
                <p className="text-sm text-gray-600">
                  {isAvatarDragging ? 'Drop your photo here' : 'Drag and drop or click to upload'}
                </p>
                <p className="text-xs text-gray-400">JPEG, PNG, or GIF • Max 5MB</p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* ============== BANNER SECTION ============== */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Profile Banner <span className="text-gray-400 font-normal">(Optional)</span>
            </h3>

            {/* Banner Preview */}
            <div className="relative w-full aspect-[3/1] bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg overflow-hidden">
              {currentBannerUrl ? (
                <img
                  src={currentBannerUrl}
                  alt="Profile banner"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No banner yet</p>
                  </div>
                </div>
              )}

              {bannerUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
              )}

              {currentBannerUrl && !bannerUploading && (
                <button
                  onClick={handleRemoveBanner}
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-md transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Banner Drag and Drop Zone */}
            <div
              onDragOver={handleBannerDragOver}
              onDragLeave={handleBannerDragLeave}
              onDrop={handleBannerDrop}
              onClick={() => bannerInputRef.current?.click()}
              className={cn(
                'mt-4 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
                isBannerDragging
                  ? 'border-brand-primary bg-brand-primary/5'
                  : 'border-gray-300 hover:border-brand-primary hover:bg-gray-50',
                bannerUploading && 'pointer-events-none opacity-50'
              )}
            >
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif"
                onChange={handleBannerInputChange}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2">
                <ImagePlus className="h-6 w-6 text-gray-400" />
                <p className="text-sm text-gray-600">
                  {isBannerDragging ? 'Drop your banner here' : 'Drag and drop or click to upload banner'}
                </p>
                <p className="text-xs text-gray-400">Recommended: 1500x500px • JPEG, PNG, or GIF • Max 10MB</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={isDisabled}
          className="rounded-full"
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={handleSkip}
            disabled={isDisabled}
            className="text-gray-500 rounded-full"
          >
            Skip for now
          </Button>
          <Button
            onClick={handleContinue}
            disabled={isDisabled}
            className="bg-brand-primary hover:bg-brand-primary-hover rounded-full"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : navigating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
