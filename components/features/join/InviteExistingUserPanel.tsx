'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { getSafeRedirect } from '@/lib/utils/safeRedirect';
import { acceptInvitationAsSessionUser } from '@/lib/invite/acceptInvitationAsSessionUser';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';

type Props = {
  /** Invitation token (same as URL segment). */
  token: string;
  chapterName: string;
  /** Path to return to after sign-in, e.g. `/join/abc` or `/alumni-join/abc`. Must pass getSafeRedirect. */
  returnPath: string;
  /** Called after successful accept-invitation (auto or pending). */
  onAccepted: (opts: { needsApproval: boolean }) => void;
};

export function InviteExistingUserPanel({
  token,
  chapterName,
  returnPath,
  onAccepted,
}: Props) {
  const router = useRouter();
  const [sessionEmail, setSessionEmail] = useState<string | null | undefined>(undefined);
  const [accepting, setAccepting] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);

  const signInHref = useMemo(() => {
    const safe = getSafeRedirect(returnPath);
    if (!safe) return '/sign-in';
    return `/sign-in?redirect=${encodeURIComponent(safe)}`;
  }, [returnPath]);

  useEffect(() => {
    let cancelled = false;

    const applySession = (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => {
      if (cancelled) return;
      if (!session?.user) {
        setSessionEmail(null);
        return;
      }
      setSessionEmail(session.user.email ?? null);
    };

    supabase.auth.getSession().then(({ data: { session } }) => applySession(session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (sessionEmail === undefined) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="h-6 w-6 animate-spin text-brand-accent" aria-label="Loading session" />
      </div>
    );
  }

  if (sessionEmail === null) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 text-center space-y-2">
        <p className="text-sm text-gray-700">
          Already have a Trailblaize account?{' '}
          <Link href={signInHref} className="font-medium text-brand-primary hover:underline">
            Sign in
          </Link>{' '}
          to accept this invitation without creating a new account.
        </p>
      </div>
    );
  }

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const result = await acceptInvitationAsSessionUser(token);
      if (!result.ok) {
        if (result.status === 409 && result.code === 'ALREADY_MEMBER') {
          toast.info(result.error);
        } else {
          toast.error(result.error);
        }
        return;
      }
      toast.success(
        result.needs_approval
          ? 'Request submitted. Chapter leadership will review your membership.'
          : `You're now connected to ${result.chapter_name ?? chapterName}.`
      );
      onAccepted({ needsApproval: result.needs_approval });
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="rounded-lg border border-brand-primary/25 bg-brand-primary/5 p-4 space-y-3">
      <p className="text-sm text-gray-800">
        You&apos;re signed in as <span className="font-medium">{sessionEmail}</span>. Join{' '}
        <strong>{chapterName}</strong> using this invitation?
      </p>
      <Button
        type="button"
        className="w-full h-10 rounded-full bg-brand-primary hover:bg-brand-primary-hover text-white"
        disabled={accepting}
        onClick={handleAccept}
      >
        {accepting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />
            Working…
          </>
        ) : (
          'Accept invitation'
        )}
      </Button>
      <p className="text-xs text-gray-500 text-center">
        Wrong account?{' '}
        <button
          type="button"
          className="text-brand-primary hover:underline font-medium disabled:opacity-50"
          disabled={switchingAccount || accepting}
          onClick={async () => {
            setSwitchingAccount(true);
            try {
              await supabase.auth.signOut();
              router.push(signInHref);
            } catch {
              toast.error('Could not sign out. Try again.');
            } finally {
              setSwitchingAccount(false);
            }
          }}
        >
          {switchingAccount ? 'Signing out…' : 'Use a different account'}
        </button>
      </p>
    </div>
  );
}
