'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { supabase } from '@/lib/supabase/client';
import { useOnboarding } from '@/lib/hooks/useOnboarding';
import { useChapters } from '@/lib/hooks/useChapters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildIndustrySelectOptions, getGraduationYears, majors } from '@/lib/alumniConstants';
import {
  User,
  Building2,
  GraduationCap,
  MapPin,
  Briefcase,
  Info,
  Users,
  Loader2,
  ChevronRight,
  Phone,
  Home,
  FileText,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { BIO_MAX_LENGTH } from '@/lib/constants/profileConstants';
import { ONBOARDING_MAIN_CARD_CLASS } from '@/lib/constants/onboardingUi';
import { isAwaitingChapterMembershipApproval } from '@/lib/utils/marketingAlumniOnboarding';

const profileBasicsIndustryOptions = buildIndustrySelectOptions('Select industry');

// ============================================================================
// Constants
// ============================================================================

const USER_ROLES = [
  { value: 'alumni', label: 'Alumni' },
  { value: 'active_member', label: 'Active Member' },
];

// ============================================================================
// Component
// ============================================================================

export default function ProfileBasicsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { profile, refreshProfile } = useProfile();
  const { completeStep } = useOnboarding();
  const { chapters, loading: chaptersLoading } = useChapters();

  // Form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    chapter: '',
    chapterId: '',
    role: '' as 'alumni' | 'active_member' | 'admin' | '',
    graduationYear: '',
    major: '',
    // Active member-specific fields
    bio: '',
    phone: '',
    location: '',
    hometown: '',
    // Alumni-specific fields
    company: '',
    jobTitle: '',
    industry: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [hasInvitation, setHasInvitation] = useState(false);
  const [invitationLoading, setInvitationLoading] = useState(true);
  /** TRA-579: canonical chapter UUID when profile.chapter_id is null (pending marketing request). */
  const [pendingRequestChapterId, setPendingRequestChapterId] = useState<string | null>(null);

  const graduationYears = getGraduationYears();

  /** Chapter + role already set (e.g. join link or step 1) — hide redundant fields */
  const chapterAndRoleLocked = !!(profile?.chapter && profile?.role);
  const effectiveRole = (
    formData.role ||
    (chapterAndRoleLocked ? profile?.role : '') ||
    ''
  ) as '' | 'alumni' | 'active_member' | 'admin';
  const isAlumni = effectiveRole === 'alumni';
  /** Major required for actives and admin accounts; optional for alumni */
  const majorRequired = effectiveRole === 'active_member' || effectiveRole === 'admin';

  // Pending membership request → chapter UUID for forms/alumni row (marketing or invitation source)
  useEffect(() => {
    let cancelled = false;

    const loadPendingChapterId = async () => {
      if (!user?.id || profile?.chapter_id) {
        setPendingRequestChapterId(null);
        return;
      }

      const { data, error } = await supabase
        .from('chapter_membership_requests')
        .select('chapter_id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .in('source', ['marketing_alumni', 'invitation'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || error) return;
      if (data?.chapter_id) {
        setPendingRequestChapterId(data.chapter_id);
      } else {
        setPendingRequestChapterId(null);
      }
    };

    void loadPendingChapterId();
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.chapter_id]);

  /**
   * Omit profiles.chapter_id until exec approval. Include invitation + no UUID yet (even if signup_channel
   * is still null before pending row loads) — but never treat marketing_alumni as invitation via sessionStorage alone.
   */
  const omitProfileChapterId =
    !profile?.chapter_id &&
    (isAwaitingChapterMembershipApproval(profile) ||
      pendingRequestChapterId !== null ||
      (hasInvitation && profile?.signup_channel !== 'marketing_alumni'));

  // When chapter name is known but UUID missing, resolve from directory (until pending fetch returns)
  useEffect(() => {
    if (!profile?.chapter?.trim() || profile.chapter_id || formData.chapterId || chapters.length === 0) {
      return;
    }
    const id = chapters.find((c) => c.name === profile.chapter)?.id;
    if (id) {
      setFormData((prev) => ({ ...prev, chapterId: id }));
    }
  }, [profile?.chapter, profile?.chapter_id, chapters, formData.chapterId]);

  // Apply pending-request UUID when it loads (authoritative for requested chapter)
  useEffect(() => {
    if (!pendingRequestChapterId) return;
    setFormData((prev) => ({ ...prev, chapterId: pendingRequestChapterId }));
  }, [pendingRequestChapterId]);

  // Check for invitation token and auto-populate
  useEffect(() => {
    const checkInvitation = async () => {
      if (typeof window === 'undefined' || !user) {
        setInvitationLoading(false);
        return;
      }

      try {
        const invitationToken = sessionStorage.getItem('invitation_token');
        const invitationType = sessionStorage.getItem('invitation_type');

        if (invitationToken) {
          setHasInvitation(true);

          // Try to fetch invitation data
          const response = await fetch(`/api/join/${invitationToken}`);
          if (response.ok) {
            const data = await response.json();
            if (data.valid && data.invitation) {
              const roleValue = data.invitation.invitation_type === 'alumni' ? 'alumni' : 'active_member';
              setFormData(prev => ({
                ...prev,
                chapter: data.invitation.chapter_name || prev.chapter,
                chapterId: data.invitation.chapter_id || prev.chapterId,
                role: roleValue,
              }));

              // Clean up after delay
              setTimeout(() => {
                sessionStorage.removeItem('invitation_token');
                sessionStorage.removeItem('invitation_type');
              }, 1000);
            }
          }
        }

        // Check if profile already has chapter and/or role (saved from step 1)
        // Note: These are checked separately — OAuth alumni users always have both
        // saved from step 1, but we handle each independently as a safety net.
        if (profile?.signup_channel === 'invitation') {
          setHasInvitation(true);
        }
        if (profile?.chapter || profile?.role) {
          if (profile.role === 'active_member') {
            setHasInvitation(true);
          }
          setFormData(prev => ({
            ...prev,
            chapter: profile.chapter || prev.chapter,
            chapterId: profile.chapter_id || prev.chapterId,
                role: (profile.role as 'alumni' | 'active_member' | 'admin') || prev.role,
          }));
        }
      } catch (error) {
        console.error('Error checking invitation:', error);
      } finally {
        setInvitationLoading(false);
      }
    };

    checkInvitation();
  }, [user, profile]);

  // Pre-populate form with OAuth data
  useEffect(() => {
    if (user?.user_metadata) {
      setFormData(prev => ({
        ...prev,
        firstName: user.user_metadata.given_name || user.user_metadata.first_name || user.user_metadata.name?.split(' ')[0] || prev.firstName,
        lastName: user.user_metadata.family_name || user.user_metadata.last_name || user.user_metadata.name?.split(' ').slice(1).join(' ') || prev.lastName,
        email: user.email || prev.email,
      }));
    }

    // Also use profile data if available
    if (profile) {
      const rawPhone = profile.phone || '';
      setFormData(prev => ({
        ...prev,
        firstName: profile.first_name || prev.firstName,
        lastName: profile.last_name || prev.lastName,
        email: profile.email || prev.email,
        graduationYear: profile.grad_year?.toString() || prev.graduationYear,
        major: profile.major || prev.major,
        location: profile.location || prev.location,
        bio: profile.bio || prev.bio,
        phone: rawPhone ? formatPhoneNumber(rawPhone) : prev.phone,
        hometown: profile.hometown || prev.hometown,
      }));
    }
  }, [user, profile]);

  // Fetch alumni data if user is alumni (from LinkedIn import)
  useEffect(() => {
    const fetchAlumniData = async () => {
      if (!user?.id || !profile?.role || profile.role !== 'alumni') return;

      try {
        const { data: alumniData, error } = await supabase
          .from('alumni')
          .select('company, job_title, industry, location, graduation_year')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching alumni data:', error);
          return;
        }

        if (alumniData) {
          setFormData(prev => ({
            ...prev,
            company: alumniData.company && alumniData.company !== 'Not specified' ? alumniData.company : prev.company,
            jobTitle: alumniData.job_title && alumniData.job_title !== 'Not specified' ? alumniData.job_title : prev.jobTitle,
            industry: alumniData.industry && alumniData.industry !== 'Not specified' ? alumniData.industry : prev.industry,
            location: alumniData.location && alumniData.location !== 'Not specified' ? alumniData.location : prev.location,
            graduationYear: alumniData.graduation_year?.toString() || prev.graduationYear,
          }));
        }
      } catch (err) {
        console.error('Error fetching alumni data:', err);
      }
    };

    fetchAlumniData();
  }, [user?.id, profile?.role]);

  // Redirect if no user
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/sign-in');
    }
  }, [user, authLoading, router]);

  // Phone number formatting
  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digits
    const phoneNumber = value.replace(/\D/g, '');

    // Limit to 10 digits
    const limitedPhone = phoneNumber.slice(0, 10);

    // Format as (XXX) XXX-XXXX
    if (limitedPhone.length === 0) return '';
    if (limitedPhone.length <= 3) {
      return `(${limitedPhone}`;
    } else if (limitedPhone.length <= 6) {
      return `(${limitedPhone.slice(0, 3)}) ${limitedPhone.slice(3)}`;
    } else {
      return `(${limitedPhone.slice(0, 3)}) ${limitedPhone.slice(3, 6)}-${limitedPhone.slice(6)}`;
    }
  };

  // Phone number validation (required - empty is invalid)
  const isValidPhoneNumber = (phone: string): boolean => {
    if (!phone || phone.trim().length === 0) return false;
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10;
  };

  // Handle input changes
  const handleChange = (field: string, value: string) => {
    // Special handling for phone number (format as user types)
    if (field === 'phone') {
      const formatted = formatPhoneNumber(value);
      setFormData(prev => ({ ...prev, [field]: formatted }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }

    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Handle chapter selection
  const handleChapterChange = (chapterName: string) => {
    const selectedChapter = chapters.find(c => c.name === chapterName);
    setFormData(prev => ({
      ...prev,
      chapter: chapterName,
      chapterId: selectedChapter?.id || '',
    }));
    if (errors.chapter) {
      setErrors(prev => {
        const next = { ...prev };
        delete next.chapter;
        return next;
      });
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!chapterAndRoleLocked) {
      if (!formData.chapter) newErrors.chapter = 'Chapter is required';
      if (!formData.role) newErrors.role = 'Role is required';
    }
    if (!formData.graduationYear) newErrors.graduationYear = 'Graduation year is required';

    // Alumni-specific validation
    if (isAlumni) {
      if (!formData.industry) newErrors.industry = 'Industry is required for alumni';
      if (!formData.company?.trim()) newErrors.company = 'Company is required';
      if (!formData.jobTitle?.trim()) newErrors.jobTitle = 'Job title is required';
    }

    // Phone required; must be 10 digits
    if (!formData.phone?.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!isValidPhoneNumber(formData.phone)) {
      newErrors.phone = 'Please enter a valid 10-digit phone number';
    }

    // Major: required for active members and admin; optional for alumni
    if (majorRequired) {
      if (!formData.major?.trim()) {
        newErrors.major = 'Major is required for active members and chapter administrators';
      }
    }

    // Location: required whenever the contact/location section is shown (active, admin, alumni)
    if (effectiveRole === 'active_member' || effectiveRole === 'admin' || isAlumni) {
      if (!formData.location?.trim()) {
        newErrors.location = 'Location is required';
      }
    }

    // Bio length validation (TRA-491)
    if (formData.bio && formData.bio.length > BIO_MAX_LENGTH) {
      newErrors.bio = `Bio must be ${BIO_MAX_LENGTH} characters or fewer. Currently ${formData.bio.length} characters.`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !validateForm()) return;

    setLoading(true);

    try {
      const fullName = `${formData.firstName} ${formData.lastName}`;
      const chapterName =
        formData.chapter?.trim() || profile?.chapter?.trim() || '';
      const resolvedChapterUuid =
        formData.chapterId ||
        profile?.chapter_id ||
        pendingRequestChapterId ||
        (chapterName
          ? chapters.find((c) => c.name === chapterName)?.id ?? null
          : null);
      const roleRaw = formData.role || profile?.role || '';
      const normalizedRole = roleRaw.toLowerCase();
      if (!normalizedRole) {
        toast.error('Role is required.');
        setLoading(false);
        return;
      }

      // Update profiles table (TRA-579/invitation-pending: do not set profiles.chapter_id until exec approves)
      const updateData: Record<string, unknown> = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        full_name: fullName,
        email: formData.email,
        chapter: chapterName,
        role: normalizedRole,
        grad_year: parseInt(formData.graduationYear, 10),
        major: formData.major?.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (!omitProfileChapterId) {
        updateData.chapter_id = resolvedChapterUuid;
      } else if (profile?.signup_channel === 'invitation') {
        updateData.signup_channel = 'invitation';
      } else if (profile?.signup_channel === 'marketing_alumni') {
        updateData.signup_channel = 'marketing_alumni';
      }

      if (formData.location?.trim()) {
        updateData.location = formData.location.trim();
      }

      // Save phone for all roles
      if (formData.phone) {
        updateData.phone = formData.phone;
      }

      // Add bio and hometown for all roles (if provided)
      if (formData.bio) updateData.bio = formData.bio.trim() || null;
      if (formData.hometown) updateData.hometown = formData.hometown;

      const { error: profileError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Create/update alumni record if alumni role (chapter name + optional UUID; profile.chapter_id may stay null for pending marketing)
      if (normalizedRole === 'alumni') {
        const alumniRow: Record<string, unknown> = {
          user_id: user.id,
          first_name: formData.firstName,
          last_name: formData.lastName,
          full_name: fullName,
          chapter: chapterName,
          industry: formData.industry.trim(),
          graduation_year: parseInt(formData.graduationYear, 10),
          company: formData.company.trim(),
          job_title: formData.jobTitle.trim(),
          email: formData.email || user.email,
          phone: formData.phone || null,
          location: formData.location.trim(),
          description: `Alumni from ${chapterName}`,
          avatar_url: profile?.avatar_url || null,
          verified: false,
          is_actively_hiring: false,
          last_contact: null,
          tags: null,
          mutual_connections: [],
          updated_at: new Date().toISOString(),
        };
        if (resolvedChapterUuid) {
          alumniRow.chapter_id = resolvedChapterUuid;
        }

        const { error: alumniError } = await supabase.from('alumni').upsert(alumniRow, {
          onConflict: 'user_id',
          ignoreDuplicates: false,
        });

        if (alumniError) {
          console.error('Alumni record error:', alumniError);
          // Don't block the flow
        }
      }

      // Refresh profile data
      await refreshProfile();

      // Mark step as complete and move to next
      toast.success('Profile basics saved!');
      await completeStep('profile-basics');

    } catch (error) {
      console.error('Profile update error:', error);
      toast.error('Failed to save profile. Please try again.');
      setLoading(false);
    } 
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card className={ONBOARDING_MAIN_CARD_CLASS}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-brand-primary" />
            Tell Us About Yourself
          </CardTitle>
          {omitProfileChapterId && (
            <p
              className={cn(
                'mt-3 rounded-lg border border-brand-accent/20 px-3 py-2.5 text-sm text-slate-700',
                'bg-gradient-to-r from-slate-50/90 to-brand-accent-light/50 shadow-sm'
              )}
            >
              <span className="font-medium text-slate-900">{profile?.chapter ?? 'Your chapter'}</span>: membership
              pending approval. Finish your profile & unlock more once you&apos;re approved.
            </p>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  placeholder="John"
                  className={cn(errors.firstName && 'border-red-500')}
                />
                {errors.firstName && (
                  <p className="text-sm text-red-500">{errors.firstName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  placeholder="Doe"
                  className={cn(errors.lastName && 'border-red-500')}
                />
                {errors.lastName && (
                  <p className="text-sm text-red-500">{errors.lastName}</p>
                )}
              </div>
            </div>

            {!chapterAndRoleLocked && (
              <>
                {/* Chapter Selection */}
                <div className="space-y-2">
                  <Label htmlFor="chapter" className="flex items-center gap-2">
                    Chapter *
                  </Label>
                  <Select
                    value={formData.chapter}
                    onValueChange={handleChapterChange}
                    disabled={chaptersLoading || !!profile?.chapter}
                  >
                    <SelectTrigger className={cn(errors.chapter && 'border-red-500')}>
                      <SelectValue placeholder="Select your chapter" />
                    </SelectTrigger>
                    <SelectContent>
                      {chapters.map((chapter) => (
                        <SelectItem key={chapter.id} value={chapter.name}>
                          {chapter.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.chapter && (
                    <p className="text-sm text-red-500">{errors.chapter}</p>
                  )}
                </div>

                {/* Role Selection */}
                <div className="space-y-2">
                  <Label htmlFor="role" className="flex items-center gap-2">
                    I am a(n) *
                  </Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => handleChange('role', value)}
                    disabled={hasInvitation && !!formData.role}
                  >
                    <SelectTrigger className={cn(errors.role && 'border-red-500')}>
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      {(hasInvitation ? USER_ROLES : USER_ROLES.filter(r => r.value === 'alumni')).map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.role && (
                    <p className="text-sm text-red-500">{errors.role}</p>
                  )}
                </div>
              </>
            )}

            {/* Graduation Year */}
            <div className="space-y-2">
              <Label htmlFor="graduationYear" className="flex items-center gap-2">
                Graduation Year *
              </Label>
              <Select
                value={formData.graduationYear}
                onValueChange={(value) => handleChange('graduationYear', value)}
              >
                <SelectTrigger className={cn(errors.graduationYear && 'border-red-500')}>
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {graduationYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.graduationYear && (
                <p className="text-sm text-red-500">{errors.graduationYear}</p>
              )}
            </div>

            {/* Major */}
            <div className="space-y-2">
              <Label htmlFor="major" className="flex items-center gap-2">
                Major {majorRequired ? '*' : '(Optional)'}
              </Label>
              <SearchableSelect
                value={formData.major}
                onValueChange={(value) => handleChange('major', value)}
                options={majors.map(major => ({ value: major, label: major }))}
                placeholder="Select Major"
                searchPlaceholder="Search majors..."
                className={cn(errors.major && 'border-red-500')}
                allowCustom
              />
              {errors.major && (
                <p className="text-sm text-red-500">{errors.major}</p>
              )}
            </div>

            {/* Additional Information - active members, admins, and alumni */}
            {(effectiveRole === 'active_member' || effectiveRole === 'admin' || isAlumni) && (
              <>
                <div className="border-t pt-6 mt-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Additional Information
                  </h3>

                  {/* Bio */}
                  <div className="space-y-2 mb-4">
                    <Label htmlFor="bio" className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      Bio (Optional)
                    </Label>
                    <Textarea
                      id="bio"
                      value={formData.bio}
                      onChange={(e) => handleChange('bio', e.target.value)}
                      placeholder="Tell us a bit about yourself..."
                      rows={4}
                      maxLength={BIO_MAX_LENGTH}
                      className={cn("resize-none", errors.bio && "border-red-500")}
                    />
                    <p className={cn("text-xs", errors.bio ? "text-red-500" : "text-gray-500")}>
                      {errors.bio || `${formData.bio.length}/${BIO_MAX_LENGTH} characters`}
                    </p>
                  </div>

                  {/* Phone & Location */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400" />
                        Phone *
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        placeholder="e.g., (555) 123-4567"
                        className={cn(errors.phone && 'border-red-500')}
                      />
                      {errors.phone && (
                        <p className="text-sm text-red-500">{errors.phone}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location" className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        Current Location *
                      </Label>
                      <Input
                        id="location"
                        value={formData.location}
                        onChange={(e) => handleChange('location', e.target.value)}
                        placeholder="e.g., Tampa, FL"
                        className={cn(errors.location && 'border-red-500')}
                      />
                      {errors.location && (
                        <p className="text-sm text-red-500">{errors.location}</p>
                      )}
                    </div>
                  </div>

                  {/* Hometown */}
                  <div className="space-y-2">
                    <Label htmlFor="hometown" className="flex items-center gap-2">
                      <Home className="h-4 w-4 text-gray-400" />
                      Hometown (Optional)
                    </Label>
                    <Input
                      id="hometown"
                      value={formData.hometown}
                      onChange={(e) => handleChange('hometown', e.target.value)}
                      placeholder="e.g., Jackson, MS"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Alumni-specific fields */}
            {isAlumni && (
              <>
                <div className="border-t pt-6 mt-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Professional Information
                  </h3>

                  {/* Industry */}
                  <div className="space-y-2 mb-4">
                    <Label htmlFor="industry">Industry *</Label>
                    <SearchableSelect
                      value={formData.industry}
                      onValueChange={(value) => handleChange('industry', value)}
                      options={profileBasicsIndustryOptions}
                      placeholder="Select industry"
                      searchPlaceholder="Search industries..."
                      className={cn(errors.industry && 'border-red-500')}
                      allowCustom
                    />
                    {errors.industry && (
                      <p className="text-sm text-red-500">{errors.industry}</p>
                    )}
                  </div>

                  {/* Company & Job Title */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company">Company *</Label>
                      <Input
                        id="company"
                        value={formData.company}
                        onChange={(e) => handleChange('company', e.target.value)}
                        placeholder="e.g., Acme Corp"
                        className={cn(errors.company && 'border-red-500')}
                      />
                      {errors.company && (
                        <p className="text-sm text-red-500">{errors.company}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jobTitle">Job Title *</Label>
                      <Input
                        id="jobTitle"
                        value={formData.jobTitle}
                        onChange={(e) => handleChange('jobTitle', e.target.value)}
                        placeholder="e.g., Software Engineer"
                        className={cn(errors.jobTitle && 'border-red-500')}
                      />
                      {errors.jobTitle && (
                        <p className="text-sm text-red-500">{errors.jobTitle}</p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-primary hover:bg-brand-primary-hover rounded-full"
              >
                {loading ? (
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
