'use client';

import { useState, useEffect, useLayoutEffect, useMemo } from 'react';
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

// ============================================================================
// Component
// ============================================================================

export default function RoleChapterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { profile, refreshProfile } = useProfile();
  const profileChapter = profile?.chapter ?? '';
  const profileRole = profile?.role ?? '';
  const profileChapterId = profile?.chapter_id ?? '';
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

  // Session + profile prefill before paint so Radix Select and labels don’t flash empty.
  useLayoutEffect(() => {
    const invitationType = sessionStorage.getItem('invitation_type');

    if (invitationType) {
      setHasInvitation(true);
      if (invitationType === 'active_member') {
        setFormData(prev =>
          prev.role === 'active_member' ? prev : { ...prev, role: 'active_member' },
        );
      }
    }

    if (profileChapter || profileRole) {
      const matchingChapter = chapters.find(c => c.name === profileChapter);
      const nextChapter = profileChapter || undefined;
      const nextChapterId =
        matchingChapter?.id || profileChapterId || undefined;
      const nextRole = (profileRole as 'alumni' | 'active_member') || undefined;

      setFormData(prev => {
        const chapter = nextChapter ?? prev.chapter;
        const chapterId = nextChapterId ?? prev.chapterId;
        const role = nextRole ?? prev.role;
        if (
          prev.chapter === chapter &&
          prev.chapterId === chapterId &&
          prev.role === role
        ) {
          return prev;
        }
        return { ...prev, chapter, chapterId, role };
      });
    }
  }, [chapters, profileChapter, profileRole, profileChapterId]);

  useEffect(() => {
    const invitationType = sessionStorage.getItem('invitation_type');
    const invitationToken = sessionStorage.getItem('invitation_token');

    if (!invitationToken || (profileChapter && profileRole)) {
      return;
    }

    const loadInvitationFromToken = async () => {
      try {
        const apiPath =
          invitationType === 'alumni'
            ? `/api/alumni-join/${invitationToken}`
            : `/api/join/${invitationToken}`;
        const response = await fetch(apiPath);
        if (response.ok) {
          const data = await response.json();
          if (data.valid && data.invitation) {
            const roleValue =
              data.invitation.invitation_type === 'alumni' ? 'alumni' : 'active_member';
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
      }
    };

    void loadInvitationFromToken();
  }, [profileChapter, profileRole, chapters]);

  /** Ensures Radix Select always has a SelectItem for the current value (API list may still be loading). */
  const chapterSelectOptions = useMemo(() => {
    const fromApi = chapters.map(c => ({ id: c.id, name: c.name }));
    const namesToEnsure = new Set<string>();
    const p = profile?.chapter?.trim();
    if (p) namesToEnsure.add(p);
    const f = formData.chapter?.trim();
    if (f) namesToEnsure.add(f);

    let result = fromApi;
    for (const name of namesToEnsure) {
      if (!result.some(c => c.name === name)) {
        const id =
          name === p && profile?.chapter_id
            ? profile.chapter_id
            : name === f && formData.chapterId
              ? formData.chapterId
              : `__prefill__:${name}`;
        result = [{ id, name }, ...result];
      }
    }
    return result;
  }, [chapters, profile?.chapter, profile?.chapter_id, formData.chapter, formData.chapterId]);

  const selectChapterValue =
    formData.chapter || profile?.chapter?.trim() || '';

  // Invitation / callback users: already have chapter + role on profile. Marketing alumni must
  // still complete the form to POST a membership request (email sign-up may prefill chapter name).
  const isConfirmationMode = useMemo(() => {
    if (profile?.signup_channel === 'marketing_alumni') return false;
    return !!(profile?.role && profile?.chapter);
  }, [profile?.role, profile?.chapter, profile?.signup_channel]);

  // Handle chapter selection
  const handleChapterChange = (chapterName: string) => {
    const selectedChapter = chapters.find(c => c.name === chapterName);
    const resolvedId =
      selectedChapter?.id ||
      (chapterName === profile?.chapter ? profile.chapter_id || '' : '') ||
      '';
    setFormData(prev => ({
      ...prev,
      chapter: chapterName,
      chapterId: resolvedId || prev.chapterId,
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

    if (!formData.chapter && !profile?.chapter?.trim()) {
      newErrors.chapter = 'Please select your chapter';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !validateForm()) return;

    setLoading(true);

    try {
      const chapterNameForSubmit =
        formData.chapter || profile?.chapter?.trim() || '';
      // Ensure chapterId is set correctly (requires loaded chapter list for real UUID)
      const selectedChapter = chapters.find(c => c.name === chapterNameForSubmit);
      if (!selectedChapter) {
        throw new Error('Selected chapter not found. Please try again.');
      }

      // Extract name from all available sources (profile, OAuth metadata)
      let firstName = profile?.first_name || '';
      let lastName = profile?.last_name || '';

      if (user.user_metadata) {
        // Google OAuth: given_name, family_name
        // LinkedIn OAuth: first_name, last_name
        // Fallback: split full 'name' field
        firstName = firstName ||
          user.user_metadata.given_name ||
          user.user_metadata.first_name ||
          (user.user_metadata.name?.split(' ')[0]) ||
          '';
        lastName = lastName ||
          user.user_metadata.family_name ||
          user.user_metadata.last_name ||
          (user.user_metadata.name?.split(' ').slice(1).join(' ')) ||
          '';
      }

      // TRA-578: marketing alumni (not invitation) — queue request; do not set chapter_id until approved
      const isMarketingMembershipRequestFlow =
        profile?.signup_channel === 'marketing_alumni' && !hasInvitation;

      if (isMarketingMembershipRequestFlow) {
        const updateData: Record<string, unknown> = {
          chapter: chapterNameForSubmit,
          role: formData.role,
          member_status: formData.role === 'alumni' ? 'graduated' : 'active',
          updated_at: new Date().toISOString(),
        };

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
          throw profileError;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Session expired. Please sign in again.');
        }

        const apiRes = await fetch('/api/chapter-membership-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ chapterId: selectedChapter.id }),
        });

        const apiBody = (await apiRes.json().catch(() => null)) as {
          error?: string;
        } | null;

        if (!apiRes.ok) {
          const msg =
            apiBody && typeof apiBody.error === 'string'
              ? apiBody.error
              : 'Could not submit your chapter membership request. Please try again.';
          throw new Error(msg);
        }

        try {
          await refreshProfile();
        } catch (refreshError) {
          console.warn('Profile refresh failed after request (non-critical):', refreshError);
        }

        toast.success('Request sent! Your chapter will review your membership.');
        await completeStep('role-chapter');
        return;
      }

      // Legacy / invitation: full chapter assignment
      const updateData: Record<string, unknown> = {
        chapter: chapterNameForSubmit,
        chapter_id: selectedChapter.id,
        role: formData.role,
        member_status: formData.role === 'alumni' ? 'graduated' : 'active',
        updated_at: new Date().toISOString(),
      };

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
        throw profileError;
      }

      if (formData.role === 'alumni' && firstName.trim() && lastName.trim()) {
        try {
          await supabase
            .from('alumni')
            .upsert(
              {
                user_id: user.id,
                first_name: firstName,
                last_name: lastName,
                full_name: `${firstName} ${lastName}`,
                chapter: chapterNameForSubmit,
                chapter_id: selectedChapter.id,
                email: user.email || profile?.email || '',
                industry: 'Not specified',
                graduation_year: new Date().getFullYear(),
                company: 'Not specified',
                job_title: 'Not specified',
                location: 'Not specified',
                description: `Alumni from ${chapterNameForSubmit}`,
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

      toast.success('Chapter and role saved!');
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

  // Handle confirmation mode continue (just complete step and move on)
  const handleConfirmContinue = async () => {
    setLoading(true);
    try {
      toast.success('Welcome! Let\'s continue setting up your profile.');
      await completeStep('role-chapter');
      // Don't reset loading - page is navigating away
    } catch (error) {
      console.error('Error completing step:', error);
      toast.error('Something went wrong. Please try again.');
      setLoading(false); // Only reset on error
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
                disabled={loading}
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
                value={selectChapterValue}
                onValueChange={handleChapterChange}
                disabled={chaptersLoading}
              >
                <SelectTrigger className={cn(errors.chapter && 'border-red-500')}>
                  <SelectValue placeholder="Select your chapter" />
                </SelectTrigger>
                <SelectContent>
                  {chapterSelectOptions.map((chapter) => (
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
                    <p className="text-sm text-gray-500">Connect with your organization's network</p>
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
