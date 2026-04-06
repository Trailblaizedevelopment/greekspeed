'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useOnboarding } from '@/lib/hooks/useOnboarding';
import { useChapters } from '@/lib/hooks/useChapters';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Building2,
  Users,
  GraduationCap,
  Info,
  Loader2,
  ChevronRight,
  CheckCircle,
  Shield,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';
import { isAwaitingChapterMembershipApproval } from '@/lib/utils/marketingAlumniOnboarding';

// ============================================================================
// Component
// ============================================================================

export default function RoleChapterPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const { profile, refreshProfile } = useProfile();
  const { completeStep } = useOnboarding();
  const { chapters, loading: chaptersLoading } = useChapters();

  // Form state
  const [formData, setFormData] = useState({
    chapter: '',
    chapterId: '',
    role: 'alumni' as 'alumni' | 'active_member',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Check for invitation data in session storage
  const [hasInvitation, setHasInvitation] = useState(false);
  const [invitationLoading, setInvitationLoading] = useState(false);

  useEffect(() => {
    const loadInvitationData = async () => {
      // Check if user came through invitation flow
      const invitationType = sessionStorage.getItem('invitation_type');
      const invitationToken = sessionStorage.getItem('invitation_token');
  
      if (invitationType) {
        setHasInvitation(true);
        // If invitation specifies role, use it
        if (invitationType === 'active_member') {
          setFormData(prev => ({ ...prev, role: 'active_member' }));
        }
      }
  
      // Pre-populate from profile if available (invitation flow already set these)
      if (profile?.chapter || profile?.role) {
        const matchingChapter = chapters.find(c => c.name === profile.chapter);
        setFormData(prev => ({
          ...prev,
          chapter: profile.chapter || prev.chapter,
          chapterId: matchingChapter?.id || profile.chapter_id || prev.chapterId,
          role: (profile.role as 'alumni' | 'active_member') || prev.role,
        }));
        return; // Profile already has data, no need to fetch
      }
  
      // Fallback: if profile doesn't have chapter/role but we have an invitation token,
      // fetch invitation data to pre-populate (handles case where callback missed params)
      if (invitationToken && (!profile?.chapter || !profile?.role)) {
        setInvitationLoading(true);
        try {
          // Determine which API to call based on invitation type
          const apiPath = invitationType === 'alumni'
            ? `/api/alumni-join/${invitationToken}`
            : `/api/join/${invitationToken}`;
          const response = await fetch(apiPath);
          if (response.ok) {
            const data = await response.json();
            if (data.valid && data.invitation) {
              const roleValue = data.invitation.invitation_type === 'alumni' ? 'alumni' : 'active_member';
              const matchingChapter = chapters.find(c => c.name === data.invitation.chapter_name);
              setFormData(prev => ({
                ...prev,
                chapter: data.invitation.chapter_name || prev.chapter,
                chapterId: matchingChapter?.id || data.invitation.chapter_id || prev.chapterId,
                role: roleValue,
              }));
              setHasInvitation(true);
            }
          }
        } catch (error) {
          console.error('Error fetching invitation data for role-chapter:', error);
        } finally {
          setInvitationLoading(false);
        }
      }
    };
  
    loadInvitationData();
  }, [profile, chapters]);

  // Determine if this is confirmation mode (user already has role and chapter from invitation)
  const isConfirmationMode = useMemo(() => {
    return !!(profile?.role && profile?.chapter);
  }, [profile?.role, profile?.chapter]);

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

    if (!formData.chapter) newErrors.chapter = 'Please select your chapter';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * TRA-578: Marketing alumni stay without profiles.chapter_id until exec approval.
   * Exclude invitation-style flows (sessionStorage) so we never queue a request instead of honoring invite/chapter assignment.
   */
  const useMarketingMembershipRequestFlow =
    profile?.signup_channel === 'marketing_alumni' && !hasInvitation;

  /**
   * Do not persist profiles.chapter_id while exec approval is pending (marketing or invitation).
   * Invitation pending already has chapter_membership_requests row from accept; do not duplicate marketing POST.
   */
  const omitProfileChapterId =
    useMarketingMembershipRequestFlow ||
    isAwaitingChapterMembershipApproval(profile) ||
    (!!hasInvitation && !profile?.chapter_id);

  /** TRA-590: shared POST so confirmation mode (sign-up pre-filled chapter/role) also queues the row. */
  const postMarketingMembershipRequest = useCallback(
    async (chapterUuid: string): Promise<boolean> => {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();

      let bearer = freshSession?.access_token;
      if (!bearer) {
        try {
          bearer = getAuthHeaders().Authorization.replace(/^Bearer\s+/i, '');
        } catch {
          bearer = undefined;
        }
      }

      if (!bearer) {
        toast.error('Please sign in again to submit your chapter request.');
        return false;
      }

      const requestRes = await fetch('/api/chapter-membership-requests', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chapterId: chapterUuid }),
      });

      const requestBody: { error?: string } = await requestRes.json().catch(() => ({}));
      const errText =
        typeof requestBody.error === 'string' ? requestBody.error.trim() : '';

      if (requestRes.ok) {
        return true;
      }

      if (requestRes.status === 400 && errText.includes('already exists')) {
        return true;
      }

      const serverMsg =
        errText ||
        (requestRes.status === 401
          ? 'Your session expired. Please sign in again.'
          : requestRes.status === 403
            ? 'You are not eligible to submit a request through this flow.'
            : `Could not submit your chapter request (${requestRes.status}). Please try again.`);
      toast.error(serverMsg);
      return false;
    },
    [getAuthHeaders]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !validateForm()) return;

    setLoading(true);

    try {
      const selectedChapter = chapters.find(c => c.name === formData.chapter);
      if (!selectedChapter) {
        throw new Error('Selected chapter not found. Please try again.');
      }

      let firstName = profile?.first_name || '';
      let lastName = profile?.last_name || '';

      if (user.user_metadata) {
        firstName =
          firstName ||
          user.user_metadata.given_name ||
          user.user_metadata.first_name ||
          user.user_metadata.name?.split(' ')[0] ||
          '';
        lastName =
          lastName ||
          user.user_metadata.family_name ||
          user.user_metadata.last_name ||
          user.user_metadata.name?.split(' ').slice(1).join(' ') ||
          '';
      }

      const updateData: Record<string, unknown> = {
        chapter: formData.chapter,
        role: formData.role,
        member_status: formData.role === 'alumni' ? 'graduated' : 'active',
        updated_at: new Date().toISOString(),
      };

      if (!omitProfileChapterId) {
        updateData.chapter_id = selectedChapter.id;
      } else if (profile?.signup_channel === 'invitation') {
        updateData.signup_channel = 'invitation';
      } else if (profile?.signup_channel === 'marketing_alumni') {
        updateData.signup_channel = 'marketing_alumni';
      }

      if (firstName.trim()) updateData.first_name = firstName;
      if (lastName.trim()) updateData.last_name = lastName;
      if (firstName.trim() && lastName.trim()) {
        updateData.full_name = `${firstName} ${lastName}`;
      }

      if (profile?.avatar_url) {
        updateData.avatar_url = profile.avatar_url;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single();

      if (profileError) {
        console.error('Profile update error details:', {
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
          code: profileError.code,
        });
        throw new Error(profileError.message || 'Failed to save your profile.');
      }

      if (useMarketingMembershipRequestFlow) {
        const ok = await postMarketingMembershipRequest(selectedChapter.id);
        if (!ok) {
          setLoading(false);
          return;
        }
      } else if (formData.role === 'alumni' && firstName.trim() && lastName.trim()) {
        try {
          await supabase.from('alumni').upsert(
            {
              user_id: user.id,
              first_name: firstName,
              last_name: lastName,
              full_name: `${firstName} ${lastName}`,
              chapter: formData.chapter,
              chapter_id: selectedChapter.id,
              email: user.email || profile?.email || '',
              industry: 'Not specified',
              graduation_year: new Date().getFullYear(),
              company: 'Not specified',
              job_title: 'Not specified',
              location: 'Not specified',
              description: `Alumni from ${formData.chapter}`,
              verified: false,
              is_actively_hiring: false,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: 'user_id',
              ignoreDuplicates: false,
            }
          );
        } catch (alumniErr) {
          console.warn('Alumni record creation warning (will be created in profile-basics):', alumniErr);
        }
      }

      try {
        await refreshProfile();
      } catch (refreshError) {
        console.warn('Profile refresh failed after update (non-critical):', refreshError);
      }

      toast.success(
        useMarketingMembershipRequestFlow
          ? 'Membership request sent. Continue to complete your profile.'
          : 'Chapter and role saved!'
      );
      await completeStep('role-chapter');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save. Please try again.';
      console.error('Profile update error:', error);
      toast.error(errorMessage);
      setLoading(false);
    }
  };

  // Redirect if no user
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/sign-in');
    }
  }, [user, authLoading, router]);

  // NOTE: Removed auto-skip - we now show confirmation mode for invitation users

  // Handle confirmation mode continue (invitation: skip POST; marketing without chapter_id: POST first)
  const handleConfirmContinue = async () => {
    setLoading(true);
    try {
      if (useMarketingMembershipRequestFlow && !profile?.chapter_id) {
        const selectedChapter = chapters.find((c) => c.name === profile?.chapter?.trim());
        if (!selectedChapter) {
          toast.error(
            'Could not match your chapter to our directory. Please contact support or try selecting your chapter again.'
          );
          setLoading(false);
          return;
        }
        const ok = await postMarketingMembershipRequest(selectedChapter.id);
        if (!ok) {
          setLoading(false);
          return;
        }
      }

      toast.success(
        useMarketingMembershipRequestFlow && !profile?.chapter_id
          ? 'Membership request sent. Continue to complete your profile.'
          : 'Welcome! Let\'s continue setting up your profile.'
      );
      await completeStep('role-chapter');
    } catch (error) {
      console.error('Error completing step:', error);
      toast.error('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  // Confirmation mode UI for invitation users
  if (isConfirmationMode) {
    const roleLabel = profile?.role === 'active_member' ? 'Active Member' : 'Alumni';
    const roleIcon = profile?.role === 'active_member' ? Shield : GraduationCap;
    const RoleIcon = roleIcon;

    return (
      <div className="space-y-6">
        {/* Welcome Banner */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-green-900 text-sm mb-1">Welcome to Trailblaize!</h3>
                <p className="text-sm text-green-800">
                  Let&apos;s complete your profile.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2">
              You&apos;re All Set!
            </CardTitle>
            <CardDescription>
              Here&apos;s your account information. Continue to complete your profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Chapter Info */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-gray-500 text-sm">
                <Building2 className="h-4 w-4" />
                Your Chapter
              </Label>
              <div className="p-4 bg-white border border-gray-200 rounded-full">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-full">
                    <Building2 className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{profile?.chapter}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Role Info */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-gray-500 text-sm">
                <Users className="h-4 w-4" />
                Your Role
              </Label>
              <div className="p-4 bg-white border border-gray-200 rounded-full">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-full">
                    <RoleIcon className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-brand-text">{roleLabel}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Continue Button */}
            <div className="pt-0">
              <Button
                onClick={handleConfirmContinue}
                disabled={
                  loading ||
                  (useMarketingMembershipRequestFlow &&
                    !profile?.chapter_id &&
                    (chaptersLoading || chapters.length === 0))
                }
                className="w-full bg-brand-primary hover:bg-brand-primary-hover rounded-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Continue to Profile Setup
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Information Banner */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-amber-900 text-sm mb-1">Alumni Signup</h3>
              <p className="text-sm text-amber-800">
                Free signups are for alumni only. Active members must be invited by their chapter administrator.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-brand-primary" />
            Welcome! Let&apos;s Get Started
          </CardTitle>
          <CardDescription>
            Select your chapter to continue setting up your profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Chapter Selection */}
            <div className="space-y-2">
              <Label htmlFor="chapter" className="flex items-center gap-2">
                Your Chapter *
              </Label>
              <Select
                value={formData.chapter}
                onValueChange={handleChapterChange}
                disabled={chaptersLoading}
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

            {/* Role Display (Alumni only for free signup) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Your Role
              </Label>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-full">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-primary/10 rounded-lg">
                    <GraduationCap className="h-5 w-5 text-brand-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Alumni</p>
                    <p className="text-sm text-gray-500">Connect with your fraternity network</p>
                  </div>
                </div>
              </div>
              {!hasInvitation && (
                <p className="text-xs text-gray-500">
                  Active member accounts require an invitation from your chapter.
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                type="submit"
                disabled={loading || chaptersLoading}
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
