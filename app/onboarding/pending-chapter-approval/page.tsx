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
  isAwaitingChapterMembershipApproval,
} from '@/lib/utils/marketingAlumniOnboarding';
import {
  PENDING_CHAPTER_APPROVAL_SLA_COPY,
  PENDING_CHAPTER_APPROVAL_SLA_COPY_MOBILE,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO_HREF,
} from '@/lib/constants/support';
import { cn } from '@/lib/utils';

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
    const hasChapterAfterApproval =
      profile.chapter_id &&
      (profile.signup_channel === 'marketing_alumni' ||
        profile.signup_channel === 'invitation');
    if (hasChapterAfterApproval) {
      router.replace('/dashboard');
      return;
    }
    if (!isAwaitingChapterMembershipApproval(profile)) {
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
    <div
      className={cn(
        'flex w-full flex-col justify-center',
        'min-h-[min(72dvh,calc(100dvh-9rem))] sm:min-h-0 sm:justify-start'
      )}
    >
      <div className="space-y-6 w-full">
        <Card
          className={cn(
            'overflow-hidden',
            'rounded-2xl border border-brand-accent/25 shadow-sm',
            'bg-gradient-to-b from-white via-slate-50/90 to-brand-accent-light/35',
            'sm:rounded-xl sm:border-brand-accent/20 sm:bg-gradient-to-br sm:from-slate-50/95 sm:via-white sm:to-brand-accent-light/50 sm:shadow-sm'
          )}
        >
          <CardHeader
            className={cn(
              'p-4 sm:p-6',
              'text-center sm:text-left'
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Request submitted
            </p>
            <CardTitle
              className={cn(
                'flex flex-col items-center gap-2 text-slate-900',
                'text-center sm:flex-row sm:items-center sm:text-left'
              )}
            >
              <Building2 className="h-5 w-5 shrink-0 text-brand-accent" />
              <span className="sm:hidden">Awaiting approval</span>
              <span className="hidden sm:inline">Waiting for chapter approval</span>
            </CardTitle>
            <CardDescription className="text-slate-600 text-base pt-1 text-center sm:text-left">
              <span className="sm:hidden">
                A chapter admin must approve access to{' '}
                <span className="font-medium text-slate-900">{profile.chapter || 'your chapter'}</span>.
              </span>
              <span className="hidden sm:inline">
                Your profile setup is complete. A chapter administrator still needs to approve your access to{' '}
                <span className="font-medium text-slate-900">{profile.chapter || 'your chapter'}</span>.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
            <div
              className={cn(
                'flex flex-col items-center gap-2 p-3 text-sm text-slate-700 text-center',
                'rounded-xl border border-brand-accent/15 bg-gradient-to-b from-brand-accent-light/25 to-white/80',
                'sm:flex-row sm:items-start sm:gap-3 sm:text-left',
                'sm:rounded-lg sm:border-brand-accent/15 sm:bg-gradient-to-r sm:from-white/90 sm:to-brand-accent-light/35 sm:shadow-sm'
              )}
            >
              <Clock className="h-5 w-5 shrink-0 text-brand-accent sm:mt-0.5" />
              <p>
                <span className="sm:hidden">{PENDING_CHAPTER_APPROVAL_SLA_COPY_MOBILE}</span>
                <span className="hidden sm:inline">{PENDING_CHAPTER_APPROVAL_SLA_COPY}</span>
              </p>
            </div>

            <p className="text-sm text-slate-700 text-center sm:text-left">
              <span className="sm:hidden">
                Tap <strong className="text-slate-900">Refresh status</strong> after you&apos;re approved or notified.
              </span>
              <span className="hidden sm:inline">
                When you are approved, you will have full access to your chapter dashboard. Use{' '}
                <strong className="text-slate-900">Refresh status</strong> below after you hear from your chapter or
                Trailblaize.
              </span>
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
              className="flex-1 rounded-full border-gray-200 text-slate-800 hover:bg-slate-50"
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

          <p
            className={cn(
              'text-sm text-slate-600 flex flex-row flex-wrap items-center justify-center gap-2 pt-3 border-t border-gray-200/90',
              'sm:justify-start sm:pt-1 sm:text-left'
            )}
          >
            <Mail className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="sm:hidden">
              Help:{' '}
              <Link href={SUPPORT_MAILTO_HREF} className="font-medium text-brand-primary hover:underline">
                {SUPPORT_EMAIL}
              </Link>
            </span>
            <span className="hidden sm:inline">
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
    </div>
  );
}
