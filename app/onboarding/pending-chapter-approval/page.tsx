'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Clock, Loader2, LogOut, Mail, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '@/lib/supabase/client';
import {
  clearPendingMembershipFlowAcknowledged,
  isMarketingAlumniAwaitingChapterApproval,
} from '@/lib/utils/marketingAlumniOnboarding';
import {
  PENDING_CHAPTER_APPROVAL_SLA_COPY,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO_HREF,
} from '@/lib/constants/support';

/**
 * TRA-581: Marketing alumni waiting on chapter exec approval — SLA expectations, support, sign out.
 * TRA-580: routing + refresh + guards preserved.
 */
export default function PendingChapterApprovalPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: profileLoading, refreshProfile } = useProfile();
  const [checking, setChecking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) {
      router.replace('/sign-in');
      return;
    }
    if (!profile) return;

    if (profile.onboarding_completed) {
      router.replace('/dashboard');
      return;
    }
    if (profile.signup_channel === 'marketing_alumni' && profile.chapter_id) {
      router.replace('/dashboard');
      return;
    }
    if (!isMarketingAlumniAwaitingChapterApproval(profile)) {
      router.replace('/onboarding');
    }
  }, [user, profile, authLoading, profileLoading, router]);

  const handleRefresh = async () => {
    if (!profile?.id) return;
    setChecking(true);
    try {
      const { data: row, error } = await supabase
        .from('profiles')
        .select('chapter_id, onboarding_completed')
        .eq('id', profile.id)
        .single();

      if (error) throw error;

      await refreshProfile();

      if (row?.chapter_id) {
        clearPendingMembershipFlowAcknowledged(profile.id);
        toast.success('You have been approved. Welcome!');
        router.replace('/dashboard');
        return;
      }
      toast.info('Your request is still pending chapter approval.');
    } catch (e) {
      console.error(e);
      toast.error('Could not refresh status. Try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (e) {
      console.error(e);
      toast.error('Could not sign out. Please try again.');
      setSigningOut(false);
    }
  };

  if (!user || !profile) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-amber-200 bg-amber-50/80">
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-1">Request submitted</p>
          <CardTitle className="flex items-center gap-2 text-amber-950">
            <Building2 className="h-5 w-5 shrink-0" />
            Waiting for chapter approval
          </CardTitle>
          <CardDescription className="text-amber-900 text-base">
            Your profile setup is complete. A chapter administrator still needs to approve your access to{' '}
            <span className="font-medium text-amber-950">{profile.chapter || 'your chapter'}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-3 rounded-lg border border-amber-200/80 bg-white/60 p-3 text-sm text-amber-950">
            <Clock className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" />
            <p>{PENDING_CHAPTER_APPROVAL_SLA_COPY}</p>
          </div>

          <p className="text-sm text-amber-900">
            When you are approved, you will have full access to your chapter dashboard. Use <strong>Refresh status</strong>{' '}
            below after you hear from your chapter or Trailblaize.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              onClick={handleRefresh}
              disabled={checking}
              className="flex-1 bg-brand-primary hover:bg-brand-primary-hover rounded-full"
            >
              {checking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh status
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex-1 rounded-full border-amber-300 text-amber-950 hover:bg-amber-100"
            >
              {signingOut ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing out…
                </>
              ) : (
                <>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </>
              )}
            </Button>
          </div>

          <p className="text-sm text-amber-900 flex items-start gap-2 pt-1 border-t border-amber-200/80">
            <Mail className="h-4 w-4 shrink-0 mt-0.5 text-amber-800" />
            <span>
              Need help? Email{' '}
              <Link href={SUPPORT_MAILTO_HREF} className="font-medium text-brand-primary hover:underline">
                {SUPPORT_EMAIL}
              </Link>
              .
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
