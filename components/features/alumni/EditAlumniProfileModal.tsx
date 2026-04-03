'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Drawer } from 'vaul';
import { X, User, Mail, Building, Briefcase, HelpCircle, Image, Upload, Linkedin, MapPin, Phone, Home, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AvatarService } from '@/lib/services/avatarService';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { BannerService } from '@/lib/services/bannerService';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase/client';
import { trackActivity, ActivityTypes } from '@/lib/utils/activityUtils';
import { useProfileUpdateDetection } from '@/lib/hooks/useProfileUpdateDetection';
import type { DetectedChange } from '@/components/features/profile/ProfileUpdatePromptModal';
import { getGraduationYears, industries } from '@/lib/alumniConstants';
import { queueProfileUpdatePrompt } from '@/lib/utils/profileUpdatePromptQueue';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { UsernameInput } from '@/components/features/profile/UsernameInput';
import { generateProfileSlug } from '@/lib/utils/usernameUtils';
import { BIO_MAX_LENGTH } from '@/lib/constants/profileConstants';
import { DEFAULT_BANNER_IMAGE } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useVisualViewportHeight } from '@/lib/hooks/useVisualViewportHeight';

const ALUMNI_INDUSTRY_OPTIONS = [
  { value: '', label: 'Select Industry' },
  ...industries.map((industry) => ({ value: industry, label: industry })),
];

interface EditAlumniProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  onUpdate: (updatedProfile: any) => void;
  variant?: 'desktop' | 'mobile';
  onProfileUpdatedWithChanges?: (changes: DetectedChange[]) => void;
}

// Storage key for sessionStorage
const STORAGE_KEY = 'editAlumniProfileFormData';

export function EditAlumniProfileModal({ isOpen, onClose, profile, onUpdate, variant = 'desktop', onProfileUpdatedWithChanges }: EditAlumniProfileModalProps) {
  // Form state with persistence
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    chapter: '',
    graduation_year: '',
    industry: '',
    company: '',
    job_title: '',
    phone: '',
    location: '',
    description: '',
    is_actively_hiring: false,
    tags: '',
    linkedin_url: '',
    hometown: '',
    is_email_public: true,
    is_phone_public: true
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);

  // Alumni data state
  const [alumniData, setAlumniData] = useState<any>(null);
  const [loadingAlumni, setLoadingAlumni] = useState(false);
  const [isModalReady, setIsModalReady] = useState(false);

  // Visual viewport tracking for mobile keyboard handling
  const { height: visualHeight, offsetTop: vvOffsetTop } = useVisualViewportHeight();
  const [fullInnerHeight, setFullInnerHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 768
  );
  useEffect(() => {
    setFullInnerHeight(window.innerHeight);
  }, []);

  const { updateProfile, refreshProfile } = useProfile();

  // Initialize profile update detection hook
  const { detectChanges, setBaseline, clearBaseline, getBaseline } = useProfileUpdateDetection({
    ignoreNotSpecified: true,
  });

  // Form ref for programmatic submission
  const formRef = useRef<HTMLFormElement>(null);

  // SessionStorage persistence functions
  const saveFormDataToStorage = useCallback((data: typeof formData) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save form data to sessionStorage:', error);
    }
  }, []);

  const loadFormDataFromStorage = useCallback((): typeof formData | null => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error('Failed to load form data from sessionStorage:', error);
      return null;
    }
  }, []);

  const clearFormDataFromStorage = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear form data from sessionStorage:', error);
    }
  }, []);

  // Load alumni data directly from alumni table
  const loadAlumniData = useCallback(async () => {
    if (!profile?.id) return;
    
    setLoadingAlumni(true);
    try {
      const { data, error } = await supabase
        .from('alumni')
        .select('*')
        .eq('user_id', profile.id)
        .single();

      if (error) {
        console.error('Error loading alumni data:', error);
        // If no alumni record exists, create one
        await createAlumniRecord();
        return;
      }

      console.log('✅ Alumni data loaded:', data);
      setAlumniData(data);
      
      // Check for saved form data first, then use alumni data
      const savedFormData = loadFormDataFromStorage();
      const initialFormData = savedFormData || {
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        username: profile?.username || profile?.profile_slug || '',
        email: data.email || '',
        chapter: data.chapter || '',
        graduation_year: data.graduation_year?.toString() || '',
        industry: data.industry || '',
        company: data.company || '',
        job_title: data.job_title || '',
        phone: data.phone || '',
        location: data.location || '',
        description: data.description || '',
        is_actively_hiring: data.is_actively_hiring || false,
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || ''),
        linkedin_url: data.linkedin_url || '',
        hometown: data.hometown || '',
        is_email_public: data.is_email_public !== false, // Default to true if not set
        is_phone_public: data.is_phone_public !== false  // Default to true if not set
      };

      setFormData(initialFormData);
      
      // If we loaded saved data, save it again to ensure it's persisted
      if (savedFormData) {
        saveFormDataToStorage(initialFormData);
      }
      
    } catch (error) {
      console.error('Error loading alumni data:', error);
    } finally {
      setLoadingAlumni(false);
      setIsModalReady(true);
    }
  }, [profile?.id, loadFormDataFromStorage, saveFormDataToStorage]);

  // Create alumni record if it doesn't exist
  const createAlumniRecord = useCallback(async () => {
    if (!profile?.id) return;
    
    try {
      const { error } = await supabase
        .from('alumni')
        .insert({
          user_id: profile.id,
          first_name: profile.first_name || profile.full_name?.split(' ')[0] || '',
          last_name: profile.last_name || profile.full_name?.split(' ')[1] || '',
          full_name: profile.full_name || '',
          email: profile.email || '',
          chapter: profile.chapter || 'Unknown',
          graduation_year: new Date().getFullYear()
        });

      if (error) {
        console.error('Error creating alumni record:', error);
        return;
      }

      console.log('✅ Alumni record created');
      // Reload data after creation
      await loadAlumniData();
    } catch (error) {
      console.error('Error creating alumni record:', error);
    }
  }, [profile, loadAlumniData]);

  // Initialize form data when modal opens
  useEffect(() => {
    if (profile && isOpen) {
      loadAlumniData();
      
      if (profile.avatar_url) {
        setAvatarPreview(profile.avatar_url);
      }
      if (profile.banner_url) {
        setBannerPreview(profile.banner_url);
      }
    }
  }, [profile, isOpen, loadAlumniData]);

  // Cleanup when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Reset when modal closes
      clearBaseline();
    }
  }, [isOpen, clearBaseline]);

  // Set baseline for change detection when modal opens
  useEffect(() => {
    if (isOpen && profile && alumniData) {
      setBaseline({
        role: profile.role || null,
        job_title: alumniData.job_title || null,
        company: alumniData.company || null,
        industry: alumniData.industry || null,
        location: alumniData.location || null,
        hometown: alumniData.hometown || null,
      });
    }
  }, [isOpen, profile, alumniData, setBaseline]);

  // Validation functions - same as original
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateLinkedInURL = (url: string): boolean => {
    if (!url) return true;
    const linkedinRegex = /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+\/?$/;
    return linkedinRegex.test(url);
  };

  const formatPhoneNumber = (value: string): string => {
    const phoneNumber = value.replace(/\D/g, '');
    
    if (phoneNumber.length <= 3) {
      return phoneNumber;
    } else if (phoneNumber.length <= 6) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    } else {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
    }
  };

  // Input change handler with persistence
  const handleInputChange = (field: string, value: string) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    
    // Save to sessionStorage on every change
    saveFormDataToStorage(newFormData);

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Real-time validation
    if (field === 'email' && value && !validateEmail(value)) {
      setErrors(prev => ({ ...prev, email: 'Please enter a valid email address' }));
    }

    if (field === 'linkedin_url' && value && !validateLinkedInURL(value)) {
      setErrors(prev => ({ ...prev, linkedin_url: 'Please enter a valid LinkedIn URL' }));
    }
  };

  // Phone number specific handler with persistence
  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    const newFormData = { ...formData, phone: formatted };
    setFormData(newFormData);
    
    // Save to sessionStorage
    saveFormDataToStorage(newFormData);
    
    if (errors.phone) {
      setErrors(prev => ({ ...prev, phone: '' }));
    }
  };

  // Auto-suggest username when firstName/lastName change
  const [usernameManuallySet, setUsernameManuallySet] = useState(false);
  
  useEffect(() => {
    // Only suggest if username is empty and names are provided
    if (!usernameManuallySet && !formData.username && formData.first_name && formData.last_name) {
      const suggestUsername = async () => {
        try {
          const params = new URLSearchParams({
            firstName: formData.first_name,
            lastName: formData.last_name,
          });
          const response = await fetch(`/api/username/suggestions?${params.toString()}`);
          const data = await response.json();
          
          if (response.ok && data.suggestions && data.suggestions.length > 0) {
            const newFormData = { ...formData, username: data.suggestions[0] };
            setFormData(newFormData);
            saveFormDataToStorage(newFormData);
          }
        } catch (error) {
          console.error('Error fetching username suggestions:', error);
          // Fallback: generate base username client-side
          const { generateBaseUsername } = await import('@/lib/utils/usernameUtils');
          const suggested = generateBaseUsername(formData.first_name, formData.last_name);
          const newFormData = { ...formData, username: suggested };
          setFormData(newFormData);
          saveFormDataToStorage(newFormData);
        }
      };

      suggestUsername();
    }
  }, [formData.first_name, formData.last_name]);

  // Track if username was manually set
  const handleUsernameChange = (value: string) => {
    setUsernameManuallySet(true);
    handleInputChange('username', value);
  };

  // File upload handlers - exact same as original
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert('File size must be less than 5MB');
      return;
    }

    setAvatarUploading(true);
    try {
      // Upload new avatar
      const newAvatarUrl = await AvatarService.uploadAvatar(file, profile.id);
      
      if (newAvatarUrl) {
        // Delete old avatar if it exists
        if (profile.avatar_url) {
          await AvatarService.deleteOldAvatar(profile.avatar_url);
        }

        // Update profile with new avatar URL
        await AvatarService.updateProfileAvatar(profile.id, newAvatarUrl);
        
        // Update global profile state
        await updateProfile({ avatar_url: newAvatarUrl });
        
        // Update local state
        setAvatarFile(file);
        setAvatarPreview(newAvatarUrl);
        
        // Refresh profile data everywhere
        await refreshProfile();
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Failed to upload avatar. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      alert('File size must be less than 10MB');
      return;
    }

    setBannerUploading(true);
    try {
      // Upload new banner
      const newBannerUrl = await BannerService.uploadBanner(file, profile.id);
      
      if (newBannerUrl) {
        // Delete old banner if it exists (don't await - do it in background)
        if (profile.banner_url) {
          BannerService.deleteOldBanner(profile.banner_url).catch(err => 
            console.error('Error deleting old banner:', err)
          );
        }

        // Update profile with new banner URL in database
        await BannerService.updateProfileBanner(profile.id, newBannerUrl);
        
        // Update global profile state (this already updates the context)
        await updateProfile({ banner_url: newBannerUrl });
        
        // Update local state immediately for preview
        setBannerFile(file);
        setBannerPreview(newBannerUrl);
        
        // Remove refreshProfile() call - it's unnecessary and causes reload
        // The updateProfile() call above already updates the context state
      }
    } catch (error) {
      console.error('Error uploading banner:', error);
      alert('Failed to upload banner. Please try again.');
    } finally {
      setBannerUploading(false);
      // Reset the input so the same file can be selected again if needed
      e.target.value = '';
    }
  };

  // Submit handler with persistence cleanup
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const newErrors: Record<string, string> = {};
    
    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }
    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }
    if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (formData.linkedin_url && !validateLinkedInURL(formData.linkedin_url)) {
      newErrors.linkedin_url = 'Please enter a valid LinkedIn URL';
    }
    if (formData.description && formData.description.length > BIO_MAX_LENGTH) {
      newErrors.description = `Bio must be ${BIO_MAX_LENGTH} characters or fewer. Currently ${formData.description.length} characters.`;
    }

    // Validate username if provided
    if (formData.username) {
      const { validateUsername } = await import('@/lib/utils/usernameUtils');
      const validation = validateUsername(formData.username);
      if (!validation.valid) {
        newErrors.username = validation.error || 'Invalid username';
      } else {
        // Check availability (final check before submit)
        try {
          const params = new URLSearchParams({ username: formData.username });
          if (profile?.id) {
            params.append('excludeUserId', profile.id);
          }
          const response = await fetch(`/api/username/check?${params.toString()}`);
          const data = await response.json();
          if (!response.ok || !data.available) {
            newErrors.username = data.message || 'Username is not available';
          }
        } catch (error) {
          newErrors.username = 'Failed to verify username availability';
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      const baselineValues = {
        role: profile.role || null,
        job_title: alumniData?.job_title || null,
        company: alumniData?.company || null,
        industry: alumniData?.industry || null,
        location: alumniData?.location || null,
        hometown: alumniData?.hometown || null,
      };

      // Update alumni table only
      const alumniUpdates = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        full_name: `${formData.first_name.trim()} ${formData.last_name.trim()}`,
        email: formData.email.trim(),
        chapter: formData.chapter || 'Unknown',
        graduation_year: formData.graduation_year ? parseInt(formData.graduation_year) : new Date().getFullYear(),
        industry: formData.industry?.trim() || 'Not Specified',
        company: formData.company?.trim() || 'Not Specified', 
        job_title: formData.job_title?.trim() || 'Not Specified',
        phone: formData.phone?.trim() || 'Not Specified',
        location: formData.location?.trim() || 'Not Specified',
        hometown: formData.hometown?.trim() || 'Not Specified',
        description: formData.description?.trim() || null,
        linkedin_url: formData.linkedin_url?.trim() || null,
        is_actively_hiring: formData.is_actively_hiring || false,
        is_email_public: formData.is_email_public !== false,
        is_phone_public: formData.is_phone_public !== false,
        tags: formData.tags && formData.tags.trim() 
          ? formData.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0)
          : null
      };

      console.log('🔄 Updating alumni data:', alumniUpdates);

      const { data, error } = await supabase
        .from('alumni')
        .upsert({
          user_id: profile.id,
          ...alumniUpdates
        }, {
          onConflict: 'user_id'
        })
        .select();

      if (error) {
        console.error('❌ Error updating alumni data:', error);
        throw error;
      }

      console.log('✅ Alumni data updated successfully:', data);

      // Update basic profile fields for consistency
      const profileUpdates: any = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone?.trim() || null,
        location: formData.location?.trim() || null,
        linkedin_url: formData.linkedin_url?.trim() || null
      };

      // Add username and update profile_slug if username changed
      if (formData.username) {
        profileUpdates.username = formData.username;
        // Generate new profile_slug if username is different from current
        if (formData.username !== (profile?.username || profile?.profile_slug || '')) {
          profileUpdates.profile_slug = generateProfileSlug(formData.username);
        }
      }

      // ===== COMPUTE CHANGES BEFORE any async operations that might close modal =====
      const valuesToDetect = {
        role: profile.role || null,
        job_title: formData.job_title?.trim() || null,
        company: formData.company?.trim() || null,
        industry: formData.industry?.trim() || null,
        location: formData.location?.trim() || null,
        hometown: formData.hometown?.trim() || null,
      };
      
      console.log('🔍 [Pre-Save] Baseline values:', baselineValues);
      console.log('🔍 [Pre-Save] Values to detect:', valuesToDetect);
      console.log('🔍 [Pre-Save] Current baseline from hook:', getBaseline());
      
      const changesForPrompt = detectChanges(valuesToDetect);
      console.log('🔍 [Pre-Save] changesForPrompt:', changesForPrompt);
      // ===== END: Change detection computed before save =====

      await onUpdate(profileUpdates);

      // Track activity
      try {
        await trackActivity(profile.id, ActivityTypes.PROFILE_UPDATE, {
          updatedFields: Object.keys(alumniUpdates),
          timestamp: new Date().toISOString()
        });
      } catch (activityError) {
        console.error('Failed to track profile update activity:', activityError);
      }
      
      // Clear saved form data on successful save
      clearFormDataFromStorage();
      
      // Use pre-computed changes (baseline may be cleared by now due to modal close)
      console.log('🔍 Detected changes:', changesForPrompt);
      console.log('🔍 Profile chapter_id:', profile?.chapter_id);
      console.log('🔍 Should show prompt?', changesForPrompt.length > 0 && profile?.chapter_id);

      if (changesForPrompt.length > 0 && profile?.chapter_id) {
        console.log('✅ Queueing prompt for detected changes');
        // Queue the prompt in localStorage instead of calling callback directly
        queueProfileUpdatePrompt(profile.id, changesForPrompt);
        setLoading(false);
        onClose(); // Close modal normally
        return;
      } else {
        console.log('❌ Not showing prompt - changes:', changesForPrompt.length, 'chapter_id:', profile?.chapter_id);
      }

      // No changes detected, close normally
      setLoading(false);
      onClose();
    } catch (error) {
      console.error('Error updating alumni profile:', error);
    } finally {
      setLoading(false);
    }
  };

  // Close handler with persistence cleanup
  const handleClose = () => {
    clearFormDataFromStorage();
    onClose();
  };

  const handleCancel = () => {
    clearFormDataFromStorage();
    onClose();
  };


  // Only render modal when open and ready
  if (!isOpen || !isModalReady) return null;

  const isMobile = variant === 'mobile';

  const graduationYears = getGraduationYears();
  const graduationYearOptions = graduationYears.map((year) => ({
    value: String(year),
    label: String(year),
  }));

  const keyboardOpen = isMobile && visualHeight < fullInnerHeight - 50;
  const mobileDrawerStyle: React.CSSProperties | undefined = keyboardOpen
    ? {
        maxHeight: visualHeight,
        bottom: fullInnerHeight - (vvOffsetTop + visualHeight),
        transition: 'max-height 0.15s ease-out, bottom 0.15s ease-out',
      }
    : undefined;

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      direction="bottom"
      modal
      dismissible
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[10002] bg-black/50 transition-opacity" />
        <Drawer.Content
          className={`
            bg-white flex flex-col z-[10003]
            fixed bottom-0 left-0 right-0
            sm:left-1/2 sm:right-auto sm:max-w-2xl sm:w-full sm:-translate-x-1/2
            max-h-[85dvh] sm:max-h-[90vh] min-h-[40dvh]
            rounded-t-2xl sm:rounded-xl
            shadow-2xl border border-gray-200 border-b-0 sm:border
            outline-none p-0
            ${isMobile ? 'pb-[env(safe-area-inset-bottom)]' : ''}
          `}
          style={mobileDrawerStyle}
        >
          {/* Drag handle - mobile only */}
          <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mt-3 mb-2 sm:hidden" aria-hidden />

          <div className="flex flex-col flex-1 min-h-0 w-full">
        {/* Header - same as original */}
        <div className={`flex items-center justify-between border-b border-gray-200 flex-shrink-0 ${isMobile ? 'p-4' : 'p-6'}`}>
          <div className="flex items-center gap-3">
            <h2 className={`font-bold text-primary-900 ${isMobile ? 'text-xl' : 'text-2xl'}`}>Edit Profile</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable Content Area - exact same structure as original */}
        <div className={`flex-1 overflow-y-auto ${isMobile ? 'p-4' : 'p-6'}`}>
          <form ref={formRef} onSubmit={handleSubmit} className={isMobile ? 'space-y-4' : 'space-y-6'}>
            {/* Combined Profile Photo & Banner Card - exact same as original */}
            <Card className="p-0">
              <CardContent className={`relative ${isMobile ? 'h-32' : 'h-64'} p-0 overflow-hidden`}>
                {/* Banner Section */}
                <div 
                  className="absolute inset-0 flex items-center justify-center text-white cursor-pointer group rounded-lg overflow-hidden"
                  onClick={() => document.getElementById('banner-upload')?.click()}
                >
                  <img 
                    src={bannerPreview || profile?.banner_url || DEFAULT_BANNER_IMAGE} 
                    alt="Profile banner" 
                    className="w-full h-full object-cover rounded-lg"
                  />
                  
                  <div className={`absolute inset-0 flex flex-col items-center justify-start opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg ${isMobile ? 'pt-4' : 'pt-8'}`}>
                    <div className="text-center">
                      {bannerUploading ? (
                        <div className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2`} />
                      ) : (
                        <Upload className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} mx-auto mb-2`} />
                      )}
                      <p className={isMobile ? 'text-sm font-medium' : 'text-lg font-medium'}>
                        {bannerUploading ? 'Uploading...' : 'Upload Banner'}
                      </p>
                      {!isMobile && (
                        <p className="text-sm">
                          {bannerUploading ? 'Please wait...' : 'Click to upload banner image'}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {!bannerPreview && !profile?.banner_url && (
                    <div className="text-center opacity-80 group-hover:opacity-0 transition-opacity">
                      <p className={isMobile ? 'text-sm font-medium' : 'text-lg font-medium'}>Banner Image</p>
                      {!isMobile && (
                        <p className="text-sm">Click to upload your banner</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Profile Photo Section */}
                <div className={`absolute ${isMobile ? 'bottom-2 left-2' : 'bottom-4 left-4'} z-10`}>
                  <div className="relative">
                    <div className={`${isMobile ? 'w-16 h-16 border-2' : 'w-20 h-20 border-4'} rounded-full border-white shadow-lg bg-gray-50 flex items-center justify-center overflow-hidden`}>
                      {avatarPreview || profile?.avatar_url ? (
                        <img 
                          src={avatarPreview || profile.avatar_url} 
                          alt="Profile avatar" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-xl font-semibold text-gray-500">
                          {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                        </div>
                      )}
                    </div>
                    
                    <div className={`absolute -bottom-1 -right-1 ${isMobile ? 'w-6 h-6' : 'w-7 h-7'} bg-brand-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-brand-primary-hover transition-colors shadow-md`}>
                      {avatarUploading ? (
                        <div className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} border-2 border-white border-t-transparent rounded-full animate-spin`} />
                      ) : (
                        <Image className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} text-white`} />
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif"
                        onChange={handleAvatarChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        disabled={avatarUploading}
                      />
                    </div>
                  </div>
                </div>

                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBannerChange}
                  className="hidden"
                  id="banner-upload"
                  disabled={bannerUploading}
                />
              </CardContent>
            </Card>

            {/* Personal Information */}
            <div className={`${isMobile ? 'space-y-3 pt-4 border-t border-gray-200 mt-4' : 'space-y-4'}`}>
              {!isMobile && (
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-5 h-5 text-brand-primary" />
                  <h3 className="text-lg font-semibold text-brand-primary">Personal Information</h3>
                </div>
              )}
              <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="first_name" className="flex items-center gap-2">
                      First Name
                      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">Required</Badge>
                    </Label>
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => handleInputChange('first_name', e.target.value)}
                      className="mt-1"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="last_name" className="flex items-center gap-2">
                      Last Name
                      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">Required</Badge>
                    </Label>
                    <Input
                      id="last_name"
                      value={formData.last_name}
                      onChange={(e) => handleInputChange('last_name', e.target.value)}
                      className="mt-1"
                      required
                    />
                  </div>
                </div>

                {/* Username Field */}
                <UsernameInput
                  value={formData.username}
                  onChange={handleUsernameChange}
                  onValidationChange={(valid) => {
                    if (!valid && !errors.username) {
                      // Validation will be handled by UsernameInput component
                    }
                  }}
                  excludeUserId={profile?.id}
                  firstName={formData.first_name}
                  lastName={formData.last_name}
                  error={errors.username}
                  disabled={loading}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Email
                      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">Required</Badge>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className={`mt-1 ${errors.email ? 'border-red-500 focus:border-red-500' : ''}`}
                      required
                    />
                    {errors.email && (
                      <p className="text-xs text-red-500 mt-1">{errors.email}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="graduation_year">Graduation Year</Label>
                    <SearchableSelect
                      value={formData.graduation_year || ''}
                      onValueChange={(value) => handleInputChange('graduation_year', value)}
                      options={graduationYearOptions}
                      placeholder="Select graduation year"
                      searchPlaceholder="Search years..."
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Professional Information - Alumni-specific */}
            <div className={`${isMobile ? 'space-y-3 pt-4 border-t border-gray-200' : 'space-y-4'}`}>
              {!isMobile && (
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="w-5 h-5 text-brand-primary" />
                  <h3 className="text-lg font-semibold text-brand-primary">Professional Information</h3>
                  <Badge variant="secondary" className="text-xs">Alumni</Badge>
                </div>
              )}
              <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="industry">Industry</Label>
                    <SearchableSelect
                      value={formData.industry || ''}
                      onValueChange={(value) => handleInputChange('industry', value)}
                      options={ALUMNI_INDUSTRY_OPTIONS}
                      placeholder="Select Industry"
                      searchPlaceholder="Search industries..."
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) => handleInputChange('company', e.target.value)}
                      className="mt-1"
                      placeholder="Google, Microsoft, Amazon..."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="job_title">Job Title</Label>
                    <Input
                      id="job_title"
                      value={formData.job_title}
                      onChange={(e) => handleInputChange('job_title', e.target.value)}
                      className="mt-1"
                      placeholder="Software Engineer..."
                    />
                  </div>
                  <div className="flex items-center space-x-2 mt-6">
                    <Checkbox
                      id="is_actively_hiring"
                      checked={formData.is_actively_hiring}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, is_actively_hiring: checked as boolean }))
                      }
                    />
                    <Label htmlFor="is_actively_hiring" className="text-sm">
                      Actively hiring
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact & Location */}
            <div className={`${isMobile ? 'space-y-3 pt-4 border-t border-gray-200' : 'space-y-4'}`}>
              {!isMobile && (
                <div className="flex items-center gap-2 mb-3">
                  <Phone className="w-5 h-5 text-brand-primary" />
                  <h3 className="text-lg font-semibold text-brand-primary">Contact & Location</h3>
                </div>
              )}
              <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                <div>
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    Phone *
                  </Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className="mt-1"
                    placeholder="(555) 123-4567"
                    maxLength={14}
                  />
                </div>
                
                <div>
                  <Label htmlFor="linkedin_url" className="flex items-center gap-2">
                    <Linkedin className="w-4 h-4" />
                    LinkedIn URL
                    <Badge variant="secondary" className="text-xs hidden sm:inline-flex">Optional</Badge>
                  </Label>
                  <Input
                    id="linkedin_url"
                    value={formData.linkedin_url}
                    onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
                    className={`mt-1 ${errors.linkedin_url ? 'border-red-500 focus:border-red-500' : ''}`}
                    placeholder="https://linkedin.com/in/yourprofile"
                    type="url"
                  />
                  {errors.linkedin_url && (
                    <p className="text-xs text-red-500 mt-1">{errors.linkedin_url}</p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="location" className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Current Location
                    </Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => handleInputChange('location', e.target.value)}
                      className="mt-1"
                      placeholder="Tampa, Florida"
                    />
                  </div>
                  <div>
                    <Label htmlFor="hometown" className="flex items-center gap-2">
                      <Home className="w-4 h-4" />
                      Hometown
                    </Label>
                    <Input
                      id="hometown"
                      value={formData.hometown}
                      onChange={(e) => handleInputChange('hometown', e.target.value)}
                      className="mt-1"
                      placeholder="Jackson, Mississippi"
                    />
                  </div>
                </div>
                
                {/* Privacy Settings */}
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Privacy Settings</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between border rounded-md p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">Show Email</p>
                        <p className="text-xs text-gray-500 mt-1">Other users can see your email if enabled</p>
                      </div>
                      <div className="ml-2">
                        <Checkbox
                          id="is_email_public"
                          checked={formData.is_email_public}
                          onCheckedChange={(checked) => {
                            const newFormData = { ...formData, is_email_public: checked as boolean };
                            setFormData(newFormData);
                            saveFormDataToStorage(newFormData);
                          }}
                          className="h-5 w-5" // Make it slightly larger
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between border rounded-md p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">Show Phone</p>
                        <p className="text-xs text-gray-500 mt-1">Other users can see your phone if enabled</p>
                      </div>
                      <div className="ml-2">
                        <Checkbox
                          id="is_phone_public"
                          checked={formData.is_phone_public}
                          onCheckedChange={(checked) => {
                            const newFormData = { ...formData, is_phone_public: checked as boolean };
                            setFormData(newFormData);
                            saveFormDataToStorage(newFormData);
                          }}
                          className="h-5 w-5" // Make it slightly larger
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className={`${isMobile ? 'space-y-3 pt-4 border-t border-gray-200' : 'space-y-4'}`}>
              {!isMobile && (
                <div className="flex items-center gap-2 mb-3">
                  <HelpCircle className="w-5 h-5 text-brand-primary" />
                  <h3 className="text-lg font-semibold text-brand-primary">Additional Information</h3>
                  <Badge variant="secondary" className="text-xs">Optional</Badge>
                </div>
              )}
              <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                <div>
                  <Label htmlFor="tags">Tags</Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => handleInputChange('tags', e.target.value)}
                    className="mt-1"
                    placeholder="mentor, startup, consulting, remote work..."
                  />
                  <p className="text-xs text-gray-500 mt-1">Separate tags with commas</p>
                </div>
                <div>
                  <Label htmlFor="description">Bio</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={isMobile ? 3 : 4}
                    maxLength={BIO_MAX_LENGTH}
                    className={cn("mt-1", errors.description && "border-red-500")}
                  />
                  <p className={cn("text-xs mt-1", errors.description ? "text-red-500" : "text-gray-500")}>
                    {errors.description || `${formData.description.length}/${BIO_MAX_LENGTH} characters`}
                  </p>
                </div>
              </div>
            </div>

            {/* Chapter & Role - Read Only */}
            <div className={`${isMobile ? 'space-y-3 pt-4 border-t border-gray-200' : 'space-y-4'}`}>
              {!isMobile && (
                <div className="flex items-center gap-2 mb-3">
                  <Building className="w-5 h-5 text-brand-primary" />
                  <h3 className="text-lg font-semibold text-brand-primary">Chapter & Role</h3>
                </div>
              )}
              <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="chapter" className="flex items-center gap-2">
                      Chapter
                      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">Read Only</Badge>
                    </Label>
                    <Input
                      id="chapter"
                      value={formData.chapter || 'Not set'}
                      disabled
                      className="mt-1 bg-gray-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">Chapter cannot be changed</p>
                  </div>
                  <div>
                    <Label htmlFor="role" className="flex items-center gap-2">
                      Role
                      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">Read Only</Badge>
                    </Label>
                    <Input
                      id="role"
                      value="Alumni"
                      disabled
                      className="mt-1 bg-gray-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">Role cannot be changed</p>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer - moved OUTSIDE scrollable area and form */}
        <div className={`flex justify-end items-center border-t border-gray-200 flex-shrink-0 ${isMobile ? 'p-4 pb-[calc(16px+env(safe-area-inset-bottom))]' : 'p-6'}`}>
          <div className={`flex ${isMobile ? 'space-x-2' : 'space-x-3'}`}>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className={`rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300`}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={(e) => {
                e.preventDefault();
                if (formRef.current) {
                  const syntheticEvent = {
                    preventDefault: () => {},
                    currentTarget: formRef.current,
                    target: formRef.current,
                  } as unknown as React.FormEvent<HTMLFormElement>;
                  handleSubmit(syntheticEvent);
                }  
              }}
              className={`rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap`}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
