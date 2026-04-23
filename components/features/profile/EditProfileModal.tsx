'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Drawer } from 'vaul';
import { X, User, Mail, Building, Shield, FileText, Phone, MapPin, GraduationCap, Home, Calculator, Image, Upload, Linkedin, Briefcase, HelpCircle, Edit, AlertTriangle, Save, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AvatarService } from '@/lib/services/avatarService';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { BannerService } from '@/lib/services/bannerService';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase/client';
import { useFormPersistence } from '@/lib/hooks/useFormPersistence';
import { useModal } from '@/lib/contexts/ModalContext';
import { useProfileUpdateDetection } from '@/lib/hooks/useProfileUpdateDetection';
import type { DetectedChange } from './ProfileUpdatePromptModal';
import { cn } from '@/lib/utils';
import { buildIndustrySelectOptions, getGraduationYears, majors, minors } from '@/lib/alumniConstants';
import { UsernameInput } from './UsernameInput';
import { generateProfileSlug } from '@/lib/utils/usernameUtils';
import { DEFAULT_BANNER_IMAGE } from '@/lib/constants';
import { ImageCropper, type CropType } from '@/components/features/common/ImageCropper';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { BIO_MAX_LENGTH } from '@/lib/constants/profileConstants';
import { useVisualViewportHeight } from '@/lib/hooks/useVisualViewportHeight';
import { LocationPicker } from '@/components/features/location/LocationPicker';
import type { CanonicalPlace, CanonicalPlaceConfirmed } from '@/types/canonicalPlace';
import {
  formatCanonicalPlaceDisplayForApp,
  parseCanonicalPlace,
  parseCanonicalPlaceConfirmed,
} from '@/types/canonicalPlace';

const editProfileIndustryOptions = buildIndustrySelectOptions('Select Industry');

/** JSON string + display line from `profiles.*_place` (or alumni `current_place`). */
function placeJsonAndDisplayFromProfileRaw(raw: unknown): { json: string; display: string } | null {
  if (raw == null) return null;
  const confirmed = parseCanonicalPlaceConfirmed(raw);
  if (confirmed.success) {
    return {
      json: JSON.stringify(confirmed.data),
      display: formatCanonicalPlaceDisplayForApp(confirmed.data),
    };
  }
  const loose = parseCanonicalPlace(raw);
  if (loose.success) {
    return {
      json: JSON.stringify(loose.data),
      display: formatCanonicalPlaceDisplayForApp(loose.data),
    };
  }
  return null;
}

function locationHometownInitFromProfile(profile: Record<string, unknown> | null | undefined) {
  const locFallback = String(profile?.location ?? profile?.current_location ?? '');
  const homeFallback = String(profile?.hometown ?? profile?.birth_place ?? '');
  const cp = placeJsonAndDisplayFromProfileRaw(profile?.current_place);
  const hp = placeJsonAndDisplayFromProfileRaw(profile?.hometown_place);
  return {
    location: (cp?.display || locFallback).trim(),
    hometown: (hp?.display || homeFallback).trim(),
    current_place_json: cp?.json ?? '',
    hometown_place_json: hp?.json ?? '',
  };
}

function canonicalPlaceFromFormJson(raw: string | undefined): CanonicalPlace | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = parseCanonicalPlace(JSON.parse(trimmed));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  onUpdate: (updatedProfile: any) => void;
  variant?: 'desktop' | 'mobile';
  onProfileUpdatedWithChanges?: (changes: DetectedChange[]) => void;
}

export function EditProfileModal({ isOpen, onClose, profile, onUpdate, variant = 'desktop', onProfileUpdatedWithChanges }: EditProfileModalProps) {
  // Use enhanced form persistence hook
  const {
    formData,
    updateFormData,
    resetForm,
    hasUnsavedChanges,
    isInitialized,
    initializeWithProfileData
  } = useFormPersistence({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    chapter: '',
    role: '',
    bio: '',
    phone: '',
    location: '',
    /** JSON string of confirmed canonical place from {@link LocationPicker}. */
    current_place_json: '',
    grad_year: '',
    major: '',
    minor: '',
    hometown: '',
    hometown_place_json: '',
    gpa: '',
    linkedin_url: '',
    industry: '',
    company: '',
    job_title: '',
    is_actively_hiring: false,
    description: '',
    tags: ''
  }, {
    key: `edit-profile-${profile?.id || 'default'}`,
    storage: 'sessionStorage',
    debounceMs: 1000,
    autoSave: true
  });

  const currentLocationPickerValue = useMemo(
    () => canonicalPlaceFromFormJson(formData.current_place_json),
    [formData.current_place_json]
  );
  const hometownLocationPickerValue = useMemo(
    () => canonicalPlaceFromFormJson(formData.hometown_place_json),
    [formData.hometown_place_json]
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);

  // Image cropper state
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [cropType, setCropType] = useState<CropType | null>(null);
  const [showCropper, setShowCropper] = useState(false);

  // Add alumni data state
  const [alumniData, setAlumniData] = useState<any>(null);
  const [loadingAlumni, setLoadingAlumni] = useState(false);

  // Add state to track if alumni data has been merged
  const [alumniDataMerged, setAlumniDataMerged] = useState(false);

  const { updateProfile, refreshProfile, profile: currentProfile } = useProfile();
  const { openEditProfileModal, closeEditProfileModal } = useModal();

  // Initialize profile update detection hook
  const { detectChanges, setBaseline, clearBaseline, getBaseline } = useProfileUpdateDetection({
    ignoreNotSpecified: true,
  });

  // Form ref for programmatic submission
  const formRef = useRef<HTMLFormElement>(null);
  /** Portals SearchableSelect dropdown inside the drawer so Vaul modal focus trap does not block the search input. */
  const selectDropdownPortalRef = useRef<HTMLDivElement>(null);
  const drawerContentRef = useRef<HTMLDivElement>(null);

  // Add loading state to prevent modal flicker
  const [isModalReady, setIsModalReady] = useState(false);

  // Visual viewport tracking for mobile keyboard handling
  const { height: visualHeight, offsetTop: vvOffsetTop } = useVisualViewportHeight();
  const [fullInnerHeight, setFullInnerHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 768
  );
  useEffect(() => {
    setFullInnerHeight(window.innerHeight);
  }, []);

  // Add loadAlumniData function
  const loadAlumniData = async () => {
    if (!profile?.id || profile.role !== 'alumni') return;
    
    setLoadingAlumni(true);
    try {
      const { data, error } = await supabase
        .from('alumni')
        .select('*')
        .eq('user_id', profile.id)
        .single();

      if (error) {
        console.error('Error loading alumni data:', error);
        return;
      }

      setAlumniData(data);
      // Loaded alumni data
    } catch (error) {
      console.error('Error loading alumni data:', error);
    } finally {
      setLoadingAlumni(false);
    }
  };

  // Update the useEffect to load alumni data
  useEffect(() => {
    if (profile) {
      const placeInit = locationHometownInitFromProfile(profile);
      const profileFormData = {
        first_name: profile.first_name || profile.full_name?.split(' ')[0] || '',
        last_name: profile.last_name || profile.full_name?.split(' ')[1] || '',
        email: profile.email || '',
        chapter: profile.chapter || profile.chapter_name || profile.chapter_name || 'Not set',
        username: profile.username || profile.profile_slug || '',
        role: profile.role || profile.user_role || profile.role_name || 'Not set',
        bio: profile.bio || profile.description || '',
        phone: profile.phone || profile.phone_number || '',
        location: placeInit.location,
        current_place_json: placeInit.current_place_json,
        grad_year: profile.grad_year || profile.graduation_year || '',
        major: profile.major || profile.major_field || '',
        minor: profile.minor || profile.minor_field || '',
        hometown: placeInit.hometown,
        hometown_place_json: placeInit.hometown_place_json,
        gpa: profile.gpa || profile.grade_point_average || '',
        linkedin_url: profile.linkedin_url || '',
        industry: '',
        company: '',
        job_title: '',
        is_actively_hiring: false,
        description: '',
        tags: ''
      };
      
      initializeWithProfileData(profileFormData);
      
      if (profile.avatar_url) {
        setAvatarPreview(profile.avatar_url);
      }
      if (profile.banner_url) {
        setBannerPreview(profile.banner_url);
      }

      // Load alumni data if user is alumni
      if (profile.role === 'alumni') {
        loadAlumniData().finally(() => {
          setIsModalReady(true);
        });
      } else {
        setIsModalReady(true);
      }
    }
  }, [profile, initializeWithProfileData]);

  // Add another useEffect to update formData when alumniData loads
  useEffect(() => {
    if (alumniData && !alumniDataMerged) {
      // Check if we have persisted data first
      const hasPersistedData = hasUnsavedChanges;
      
      // Only merge alumni data if no persisted data exists
      if (!hasPersistedData) {
        updateFormData(prev => ({
          ...prev,
          industry: alumniData.industry || '',
          company: alumniData.company || '',
          job_title: alumniData.job_title || '',
          is_actively_hiring: alumniData.is_actively_hiring || false,
          description: alumniData.description || '',
          tags: Array.isArray(alumniData.tags) 
            ? alumniData.tags.join(', ') 
            : alumniData.tags || '',
          grad_year: alumniData.graduation_year || prev.grad_year,
          phone: alumniData.phone || prev.phone,
        }));
      }
      setAlumniDataMerged(true);
    }
  }, [alumniData, updateFormData, alumniDataMerged, hasUnsavedChanges]);

  // Set baseline for change detection when modal opens
  useEffect(() => {
    if (isOpen && profile) {
      if (profile.role === 'alumni' && alumniData) {
        const placeInit = locationHometownInitFromProfile(profile);
        const alumniBaseline = {
          role: profile.role || null,
          job_title: alumniData.job_title || null,
          company: alumniData.company || null,
          industry: alumniData.industry || null,
          location: placeInit.location || alumniData.location || null,
          hometown: placeInit.hometown || alumniData.hometown || null,
        };
        console.log('🔍 [Alumni] Setting baseline when modal opens:', alumniBaseline);
        setBaseline(alumniBaseline);
      } else {
        const placeInit = locationHometownInitFromProfile(profile);
        // Set baseline for active members with academic/profile fields
        const activeBaseline = {
          role: profile.role || null,
          major: profile.major || null,
          minor: profile.minor || null,
          grad_year: profile.grad_year?.toString() || null,
          gpa: profile.gpa?.toString() || null,
          location: placeInit.location || profile.location || null,
          hometown: placeInit.hometown || profile.hometown || null,
        };
        console.log('🔍 [Active Member] Setting baseline when modal opens:', activeBaseline);
        setBaseline(activeBaseline);
      }
    } else if (!isOpen) {
      clearBaseline();
    }
  }, [isOpen, profile, alumniData, setBaseline, clearBaseline]);

  // Email validation regex
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // GPA validation (0.0 - 4.0)
  const validateGPA = (gpa: string): boolean => {
    const gpaNum = parseFloat(gpa);
    return !isNaN(gpaNum) && gpaNum >= 0.0 && gpaNum <= 4.0;
  };

  // Add LinkedIn URL validation function after the existing validation functions
  const validateLinkedInURL = (url: string): boolean => {
    if (!url) return true; // Optional field
    const linkedinRegex = /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+\/?$/;
    return linkedinRegex.test(url);
  };

  // Phone number formatting
  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digits
    const phoneNumber = value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (phoneNumber.length <= 3) {
      return phoneNumber;
    } else if (phoneNumber.length <= 6) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    } else {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
    }
  };

  // Enhanced input change handler with validation
  const handleInputChange = (field: string, value: string) => {
    updateFormData({ [field]: value });

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Real-time validation for specific fields
    if (field === 'email' && value) {
      if (!validateEmail(value)) {
        setErrors(prev => ({ ...prev, email: 'Please enter a valid email address' }));
      }
    }

    if (field === 'gpa' && value) {
      if (!validateGPA(value)) {
        setErrors(prev => ({ ...prev, gpa: 'GPA must be between 0.0 and 4.0' }));
      }
    }

    // Add LinkedIn validation
    if (field === 'linkedin_url' && value) {
      if (!validateLinkedInURL(value)) {
        setErrors(prev => ({ ...prev, linkedin_url: 'Please enter a valid LinkedIn URL (e.g., https://linkedin.com/in/username)' }));
      }
    }
  };

  // Phone number specific handler
  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    updateFormData({ phone: formatted });
    
    if (errors.phone) {
      setErrors(prev => ({ ...prev, phone: '' }));
    }
  };

  // Auto-suggest username when firstName/lastName change (only if username is empty)
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
            // Use the first suggestion
            updateFormData({ username: data.suggestions[0] });
          }
        } catch (error) {
          console.error('Error fetching username suggestions:', error);
          // Fallback: generate base username client-side
          const { generateBaseUsername } = await import('@/lib/utils/usernameUtils');
          const suggested = generateBaseUsername(formData.first_name, formData.last_name);
          updateFormData({ username: suggested });
        }
      };

      suggestUsername();
    }
  }, [formData.first_name, formData.last_name]); // Only trigger when names change

  // Track if username was manually set
  const handleUsernameChange = (value: string) => {
    setUsernameManuallySet(true);
    handleInputChange('username', value);
  };

  // Handle avatar file selection - show cropper first
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

    // Create preview URL and show cropper
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageToCrop(reader.result as string);
      setCropType('avatar');
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
    
    e.target.value = ''; // Reset input
  };

  // Handle banner file selection - show cropper first
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

    // Create preview URL and show cropper
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageToCrop(reader.result as string);
      setCropType('banner');
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
    
    e.target.value = ''; // Reset input
  };

  // Handle crop completion - upload the cropped image
  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!profile?.id || !cropType) return;

    const file = new File([croppedBlob], `cropped-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });

    try {
      if (cropType === 'avatar') {
        setAvatarUploading(true);
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
      } else if (cropType === 'banner') {
        setBannerUploading(true);
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
          
          // Update global profile state
          await updateProfile({ banner_url: newBannerUrl });
          
          // Update local state immediately for preview
          setBannerFile(file);
          setBannerPreview(newBannerUrl);
        }
      }
    } catch (error) {
      console.error(`Error uploading ${cropType}:`, error);
      alert(`Failed to upload ${cropType}. Please try again.`);
    } finally {
      setAvatarUploading(false);
      setBannerUploading(false);
      setShowCropper(false);
      setImageToCrop(null);
      setCropType(null);
    }
  };

  // Remove avatar
  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  // Enhanced submit handler with validation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all required fields
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
    if (formData.gpa && !validateGPA(formData.gpa)) {
      newErrors.gpa = 'GPA must be between 0.0 and 4.0';
    }
    if (formData.linkedin_url && !validateLinkedInURL(formData.linkedin_url)) {
      newErrors.linkedin_url = 'Please enter a valid LinkedIn URL';
    }
    if (formData.bio && formData.bio.length > BIO_MAX_LENGTH) {
      newErrors.bio = `Bio must be ${BIO_MAX_LENGTH} characters or fewer. Currently ${formData.bio.length} characters.`;
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
      let persistedCurrentPlace: CanonicalPlaceConfirmed | null = null;
      if (formData.current_place_json?.trim()) {
        try {
          const p = parseCanonicalPlaceConfirmed(JSON.parse(formData.current_place_json));
          if (p.success) persistedCurrentPlace = p.data;
        } catch {
          /* ignore invalid JSON */
        }
      }
      let persistedHometownPlace: CanonicalPlaceConfirmed | null = null;
      if (formData.hometown_place_json?.trim()) {
        try {
          const p = parseCanonicalPlaceConfirmed(JSON.parse(formData.hometown_place_json));
          if (p.success) persistedHometownPlace = p.data;
        } catch {
          /* ignore invalid JSON */
        }
      }

      const locationLine =
        formatCanonicalPlaceDisplayForApp(persistedCurrentPlace) || formData.location?.trim() || '';
      const hometownLine =
        formatCanonicalPlaceDisplayForApp(persistedHometownPlace) || formData.hometown?.trim() || '';

      const placeInitAtOpen = locationHometownInitFromProfile(profile);

      const baselineValues =
        profile?.role === 'alumni'
          ? {
              role: profile.role || null,
              job_title: alumniData?.job_title || null,
              company: alumniData?.company || null,
              industry: alumniData?.industry || null,
              location: placeInitAtOpen.location || alumniData?.location || null,
              hometown: placeInitAtOpen.hometown || alumniData?.hometown || null,
            }
          : {
              role: profile.role || null,
              major: profile.major || null,
              minor: profile.minor || null,
              grad_year: profile.grad_year?.toString() || null,
              gpa: profile.gpa?.toString() || null,
              location: placeInitAtOpen.location || profile.location || null,
              hometown: placeInitAtOpen.hometown || profile.hometown || null,
            };

      const valuesToDetect =
        profile?.role === 'alumni'
          ? {
              role: profile.role || null,
              job_title: formData.job_title?.trim() || null,
              company: formData.company?.trim() || null,
              industry: formData.industry?.trim() || null,
              location: locationLine || null,
              hometown: hometownLine || null,
            }
          : {
              role: profile.role || null,
              major: formData.major?.trim() || null,
              minor: formData.minor?.trim() || null,
              grad_year: formData.grad_year ? String(formData.grad_year).trim() : null,
              gpa: formData.gpa ? String(formData.gpa).trim() : null,
              location: locationLine || null,
              hometown: hometownLine || null,
            };
      
      // Guarantee baseline exists
      if (!getBaseline()) {
        setBaseline(baselineValues);
      }
      
      const changesForPrompt = detectChanges(valuesToDetect);
      console.log('🔍 [Pre-Save] valuesToDetect:', valuesToDetect);
      console.log('🔍 [Pre-Save] changesForPrompt:', changesForPrompt);

      // Update profile data - only include fields that exist in profiles table
      const profileUpdates: any = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        bio: formData.bio || null,
        phone: formData.phone || null,
        location: locationLine || null,
        current_place: persistedCurrentPlace,
        hometown_place: persistedHometownPlace,
        grad_year: formData.grad_year ? parseInt(formData.grad_year) : null,
        major: formData.major || null,
        minor: formData.minor || null,
        hometown: hometownLine || null,
        gpa: formData.gpa ? parseFloat(formData.gpa) : null,
        linkedin_url: formData.linkedin_url || null,
      };

      // Add username and update profile_slug if username changed
      if (formData.username) {
        profileUpdates.username = formData.username;
        // Generate new profile_slug if username is different from current
        if (formData.username !== (profile?.username || profile?.profile_slug || '')) {
          profileUpdates.profile_slug = generateProfileSlug(formData.username);
        }
      }

      // Remove undefined values to avoid overwriting with null
      Object.keys(profileUpdates).forEach(key => {
        if (profileUpdates[key] === undefined) {
          delete profileUpdates[key];
        }
      });

      // Updating profile
      await onUpdate(profileUpdates);

      // If user is alumni, also update alumni table
      if (profile?.role === 'alumni') {
        // Updating alumni data...
        // Update alumni-specific data
        const updateAlumniData = async () => {
          if (!profile?.id || profile.role !== 'alumni') return;

          try {
            const alumniUpdates = {
              first_name: formData.first_name || '',
              last_name: formData.last_name || '',
              full_name: `${formData.first_name || ''} ${formData.last_name || ''}`.trim(),
              email: formData.email || '',
              chapter: profile.chapter || 'Unknown',
              graduation_year: formData.grad_year ? parseInt(formData.grad_year) : new Date().getFullYear(),
              // Handle field deletion with Not Specified defaults for NOT NULL fields
              industry: formData.industry?.trim() || 'Not Specified',
              company: formData.company?.trim() || 'Not Specified', 
              job_title: formData.job_title?.trim() || 'Not Specified',
              phone: formData.phone?.trim() || 'Not Specified',
              location: locationLine || 'Not Specified',
              current_place: persistedCurrentPlace,
              hometown: hometownLine || 'Not Specified',
              description: formData.bio?.trim() || null, // This one can be null
              is_actively_hiring: formData.is_actively_hiring || false,
              tags: formData.tags && formData.tags.trim() 
                ? formData.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0)
                : null
            };

            // Alumni updates

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

            // Alumni data updated successfully
          } catch (error) {
            console.error('❌ Error updating alumni data:', error);
            throw error;
          }
        };
        await updateAlumniData();
        
        // Detect changes for alumni
        const changes = detectChanges({
          role: profile.role || null,
          job_title: formData.job_title?.trim() || null,
          company: formData.company?.trim() || null,
          industry: formData.industry?.trim() || null,
        });
        
        if (changesForPrompt.length > 0 && profile?.chapter_id) {
          onProfileUpdatedWithChanges?.(changesForPrompt);
          setLoading(false);
          onClose();
          return;
        }
      } else {
        // Verify baseline is set
        const currentBaseline = getBaseline();
        console.log('🔍 [Active Member] Current baseline from hook:', currentBaseline);
        console.log('🔍 [Active Member] Baseline values captured at start:', baselineValues);

        const valuesToDetectActive = {
          role: profile.role || null,
          major: formData.major?.trim() || null,
          minor: formData.minor?.trim() || null,
          grad_year: formData.grad_year ? String(formData.grad_year).trim() : null,
          gpa: formData.gpa ? String(formData.gpa).trim() : null,
          location: locationLine || null,
          hometown: hometownLine || null,
        };

        console.log('🔍 [Active Member] Values being passed to detectChanges:', valuesToDetectActive);

        const changes = detectChanges(valuesToDetectActive);

        console.log('🔍 [Active Member] Detected changes:', changes);
        console.log('🔍 [Active Member] Profile chapter_id:', profile?.chapter_id);
        console.log('🔍 [Active Member] Should show prompt?', changes.length > 0 && profile?.chapter_id);

        if (changesForPrompt.length > 0 && profile?.chapter_id) {
          console.log('✅ [Active Member] Calling callback with detected changes');
          onProfileUpdatedWithChanges?.(changesForPrompt);
          setLoading(false);
          onClose();
          return;
        } else {
          console.log('❌ [Active Member] Not showing prompt - changes:', changesForPrompt.length, 'chapter_id:', profile?.chapter_id);
        }
      }
      
      // No changes detected, close normally
      onClose();
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setLoading(false);
    }
  };


  // Enhanced close handler with unsaved changes warning
  const handleClose = () => {
    if (hasUnsavedChanges) {
      const confirmClose = window.confirm(
        'You have unsaved changes. Are you sure you want to close? Your changes will be saved automatically.'
      );
      if (!confirmClose) return;
    }
    onClose();
  };

  // Only render modal when ready
  if (!isOpen || !isModalReady) return null;

  const isMobile = variant === 'mobile';

  const graduationYears = profile?.role === 'alumni' ? getGraduationYears() : [];
  const graduationYearOptions = graduationYears.map((year) => ({
    value: String(year),
    label: String(year),
  }));

  // Keyboard-aware drawer sizing (mobile only)
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
          ref={drawerContentRef}
          className={`
            bg-white flex flex-col z-[10003]
            fixed bottom-0 left-0 right-0
            sm:left-1/2 sm:right-auto sm:max-w-2xl sm:w-full sm:-translate-x-1/2
            max-h-[85dvh] sm:max-h-[90vh] min-h-[40dvh]
            rounded-t-2xl sm:rounded-xl
            shadow-2xl border border-gray-200 border-b-0 sm:border
            outline-none p-0
          `}
          style={mobileDrawerStyle}
        >
          {/* Drag handle - mobile only */}
          <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mt-3 mb-2 sm:hidden" aria-hidden />

          <div className="flex flex-col flex-1 min-h-0 w-full">
        {/* Enhanced Header with Unsaved Changes Indicator */}
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

        {/* Outer host for portaled selects (must not use overflow-hidden clipping); inner div scrolls. */}
        <div ref={selectDropdownPortalRef} className="relative flex min-h-0 flex-1 flex-col">
          <div className={`min-h-0 flex-1 overflow-y-auto ${isMobile ? 'p-4' : 'p-6'}`}>
          <form ref={formRef} onSubmit={handleSubmit} className={isMobile ? 'space-y-4' : 'space-y-6'}>
            {/* Combined Profile Photo & Banner */}
            <div className={`relative ${isMobile ? 'h-32' : 'h-64'} overflow-hidden rounded-lg`}>
              {/* Banner Section - Make it clickable */}
              <div
                className="absolute inset-0 cursor-pointer group overflow-hidden rounded-lg"
                onClick={() => document.getElementById('banner-upload')?.click()}
              >
                <img
                  src={bannerPreview || profile?.banner_url || DEFAULT_BANNER_IMAGE}
                  alt="Profile banner"
                  className="pointer-events-none absolute inset-0 h-full w-full rounded-lg object-cover"
                />
                {!bannerPreview && !profile?.banner_url && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-white opacity-80 transition-opacity group-hover:opacity-0">
                    <div>
                      <p className={isMobile ? 'text-sm font-medium' : 'text-lg font-medium'}>Banner Image</p>
                      {!isMobile && <p className="text-sm">Click to upload your banner</p>}
                    </div>
                  </div>
                )}
                <div
                  className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-start rounded-lg bg-black/20 opacity-0 transition-opacity group-hover:opacity-100 ${isMobile ? 'pt-4' : 'pt-8'}`}
                >
                  <div className="text-center text-white">
                    {bannerUploading ? (
                      <div
                        className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} mx-auto mb-2 animate-spin rounded-full border-2 border-white border-t-transparent`}
                      />
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
              </div>

                {/* Profile Photo Section - Positioned at bottom-left */}
                <div className={`absolute ${isMobile ? 'bottom-2 left-2' : 'bottom-4 left-4'} z-10`}>
                  {/* Avatar Container */}
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
                    
                    {/* Upload Icon Overlay */}
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

                {/* Hidden banner upload input */}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBannerChange}
                  className="hidden"
                  id="banner-upload"
                  disabled={bannerUploading}
                />
                
                {/* Avatar Upload Input (Hidden) */}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="avatar-upload"
                />
            </div>

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

                {/* Email and Graduation Year in same row for alumni */}
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
                  
                  {/* Graduation year for alumni only */}
                  {profile?.role === 'alumni' && (
                    <div>
                      <Label htmlFor="grad_year">Graduation Year</Label>
                      <SearchableSelect
                        value={formData.grad_year || ''}
                        onValueChange={(value) => handleInputChange('grad_year', value)}
                        options={graduationYearOptions}
                        placeholder="Select graduation year"
                        searchPlaceholder="Search years..."
                        className="mt-1"
                        portalContainerRef={drawerContentRef}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Alumni-Specific Fields - Only show for alumni users, moved right after Personal Information */}
            {profile?.role === 'alumni' && (
              <>
                {/* Professional Information - Moved up for alumni */}
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
                          options={editProfileIndustryOptions}
                          placeholder="Select Industry"
                          searchPlaceholder="Search industries..."
                          className="mt-1"
                          allowCustom
                          portalContainerRef={selectDropdownPortalRef}
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
                            updateFormData({ is_actively_hiring: checked as boolean })
                          }
                        />
                        <Label htmlFor="is_actively_hiring" className="text-sm">
                          Actively hiring
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Social & Additional Info */}
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
                  </div>
                </div>
              </>
            )}

            {/* Chapter & Role */}
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
                      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">Required</Badge>
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
                      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">Required</Badge>
                    </Label>
                    <Input
                      id="role"
                      value={formData.role || 'Not set'}
                      disabled
                      className="mt-1 bg-gray-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">Role cannot be changed</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Academic Information - Only show for non-alumni users */}
            {profile?.role !== 'alumni' && (
              <div className={`${isMobile ? 'space-y-3 pt-4 border-t border-gray-200' : 'space-y-4'}`}>
                {!isMobile && (
                  <div className="flex items-center gap-2 mb-3">
                    <GraduationCap className="w-5 h-5 text-brand-primary" />
                    <h3 className="text-lg font-semibold text-brand-primary">Academic Information</h3>
                  </div>
                )}
                <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="grad_year">Graduation Year</Label>
                      <Input
                        id="grad_year"
                        value={formData.grad_year}
                        onChange={(e) => handleInputChange('grad_year', e.target.value)}
                        className="mt-1"
                        placeholder="2024"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gpa">GPA</Label>
                      <Input
                        id="gpa"
                        value={formData.gpa}
                        onChange={(e) => handleInputChange('gpa', e.target.value)}
                        className={`mt-1 ${errors.gpa ? 'border-red-500 focus:border-red-500' : ''}`}
                        placeholder="3.8"
                        type="number"
                        step="0.1"
                        min="0.0"
                        max="4.0"
                      />
                      {errors.gpa && (
                        <p className="text-xs text-red-500 mt-1">{errors.gpa}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="major">Major</Label>
                      <SearchableSelect
                        value={formData.major || ''}
                        onValueChange={(value) => handleInputChange('major', value)}
                        options={majors.map(major => ({ value: major, label: major }))}
                        placeholder="Select Major"
                        searchPlaceholder="Search majors..."
                        className="mt-1"
                        allowCustom
                        portalContainerRef={selectDropdownPortalRef}
                      />
                    </div>
                    <div>
                      <Label htmlFor="minor">Minor</Label>
                      <SearchableSelect
                        value={formData.minor || ''}
                        onValueChange={(value) => handleInputChange('minor', value)}
                        options={minors.map(minor => ({ value: minor, label: minor }))}
                        placeholder="Select Minor"
                        searchPlaceholder="Search minors..."
                        className="mt-1"
                        allowCustom
                        portalContainerRef={selectDropdownPortalRef}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                
                {/* Add LinkedIn field here for all users */}
                <div>
                  <Label htmlFor="linkedin_url" className="flex items-center gap-2">
                    <Linkedin className="w-4 h-4" />
                    LinkedIn URL
                    {!isMobile && <Badge variant="secondary" className="text-xs">Optional</Badge>}
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
                  <LocationPicker
                    label={
                      <span className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" aria-hidden />
                        Current location
                      </span>
                    }
                    fieldId="edit-profile-current-location"
                    country="us"
                    suggestionsPortalRef={selectDropdownPortalRef}
                    value={currentLocationPickerValue}
                    onChange={(place) => {
                      updateFormData({
                        current_place_json: place ? JSON.stringify(place) : '',
                        location: place ? formatCanonicalPlaceDisplayForApp(place) : '',
                      });
                    }}
                  />
                  <LocationPicker
                    label={
                      <span className="flex items-center gap-2">
                        <Home className="w-4 h-4" aria-hidden />
                        Hometown (optional)
                      </span>
                    }
                    fieldId="edit-profile-hometown"
                    country="us"
                    suggestionsPortalRef={selectDropdownPortalRef}
                    value={hometownLocationPickerValue}
                    onChange={(place) => {
                      updateFormData({
                        hometown_place_json: place ? JSON.stringify(place) : '',
                        hometown: place ? formatCanonicalPlaceDisplayForApp(place) : '',
                      });
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Bio */}
            <div className={`${isMobile ? 'space-y-3 pt-4 border-t border-gray-200' : 'space-y-4'}`}>
              {!isMobile && (
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-brand-primary" />
                  <h3 className="text-lg font-semibold text-brand-primary">Bio</h3>
                  <Badge variant="secondary" className="text-xs">Optional</Badge>
                </div>
              )}
              <div>
                <Textarea
                  value={formData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  placeholder="Tell us about yourself..."
                  rows={isMobile ? 3 : 4}
                  maxLength={BIO_MAX_LENGTH}
                  className={cn("mt-1", errors.bio && "border-red-500")}
                />
                <div className="flex justify-between items-center mt-1">
                  <p className={cn("text-xs", errors.bio ? "text-red-500" : "text-gray-500")}>
                    {errors.bio || `${formData.bio.length}/${BIO_MAX_LENGTH} characters`}
                  </p>
                </div>
              </div>
            </div>

            {/* Remove the old alumni-specific sections that were at the bottom */}
          </form>
          </div>
        </div>

        {/* Enhanced Footer with Save Options */}
        <div className={`flex justify-between items-center border-t border-gray-200 flex-shrink-0 ${isMobile ? 'p-4 pb-[max(1rem,env(safe-area-inset-bottom))]' : 'p-6'}`}>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {hasUnsavedChanges && (
              <>
                <Save className="w-4 h-4" />
                <span className="text-xs">Autosaves</span>
              </>
            )}
          </div>
          <div className={`flex ${isMobile ? 'space-x-2' : 'space-x-3'}`}>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (hasUnsavedChanges) {
                  const confirmReset = window.confirm('Are you sure you want to discard all unsaved changes?');
                  if (confirmReset) {
                    resetForm();
                  }
                } else {
                  handleClose();
                }
              }}
              className={`flex-1 rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300`}
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
              className={`flex-1 rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap`}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
          </div>

          {/* Image Cropper Modal - elevated z-index so it appears above this drawer */}
          {imageToCrop && cropType && (
            <ImageCropper
              imageSrc={imageToCrop}
              isOpen={showCropper}
              onClose={() => {
                setShowCropper(false);
                setImageToCrop(null);
                setCropType(null);
              }}
              onCropComplete={handleCropComplete}
              cropType={cropType}
              elevatedZIndex
            />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
