'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle, Clock, Loader2, Linkedin, Mail, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlumniJoinForm } from '@/components/features/join/AlumniJoinForm';
import { Invitation } from '@/types/invitations';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'react-toastify';

export default function AlumniJoinPageClient() {
  const params = useParams();
  const router = useRouter();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [showApprovalPending, setShowApprovalPending] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [linkedInIconError, setLinkedInIconError] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const token = params.token as string;

  useEffect(() => {
    // Check for OAuth callback errors
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    const validateInvitation = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/alumni-join/${token}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          
          // If the error is about wrong invitation type, redirect to active member join page
          if (errorData.error === 'This invitation is not for alumni') {
            router.push(`/join/${token}`);
            return;
          }
          
          throw new Error(errorData.error || 'Invalid alumni invitation');
        }

        const data = await response.json();
        
        if (!data.valid) {
          // If invalid due to wrong type, redirect
          if (data.error === 'This invitation is not for alumni') {
            router.push(`/join/${token}`);
            return;
          }
          throw new Error(data.error || 'Invalid alumni invitation');
        }

        // Additional safety check: Ensure this is an alumni invitation
        if (data.invitation?.invitation_type && data.invitation.invitation_type !== 'alumni') {
          // Redirect to the correct page based on invitation type
          if (data.invitation.invitation_type === 'active_member') {
            router.push(`/join/${token}`);
            return;
          }
          throw new Error('This invitation is not for alumni');
        }

        setInvitation(data.invitation);
      } catch (error) {
        console.error('Error validating alumni invitation:', error);
        
        // If error message indicates wrong type, try redirecting
        const errorMessage = error instanceof Error ? error.message : 'Failed to validate alumni invitation';
        if (errorMessage.includes('not for alumni')) {
          router.push(`/join/${token}`);
          return;
        }
        
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      validateInvitation();
    }
  }, [token, router]);

  useEffect(() => {
    if (!signupSuccess || showApprovalPending) return;
    const id = window.setTimeout(() => {
      window.location.assign('/onboarding');
    }, 1600);
    return () => window.clearTimeout(id);
  }, [signupSuccess, showApprovalPending]);

  const handleJoinSuccess = (userData: { needs_approval?: boolean }) => {
    setSignupSuccess(true);
    if (userData.needs_approval === true) {
      setShowApprovalPending(true);
    } else {
      setShowApprovalPending(false);
    }
  };

  const handleStartJoin = () => {
    setShowJoinForm(true);
  };

  const handleGoogleSignUp = async () => {
    if (!invitation) return;
    
    try {
      setGoogleLoading(true);
      setError(null);
      
      // Set flag and store invitation token to indicate OAuth redirect is happening
      sessionStorage.setItem('oauth_redirect', 'true');
      sessionStorage.setItem('invitation_token', invitation.token);
      sessionStorage.setItem('invitation_type', 'alumni');

      console.log('Initiating Google OAuth with alumni invitation:', {
        token: invitation.token,
        type: 'alumni',
        chapter_id: invitation.chapter_id,
        chapter_name: invitation.chapter_name
      });

      const callback = new URL(`${window.location.origin}/auth/callback`);
      callback.searchParams.set('invitation_token', invitation.token);
      callback.searchParams.set('invitation_type', 'alumni');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callback.toString(),
          queryParams: {
            invitation_token: invitation.token,
            invitation_type: 'alumni',
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
        
      if (error) {
        console.error('Google sign-up error:', error);
        sessionStorage.removeItem('oauth_redirect');
        sessionStorage.removeItem('invitation_token');
        sessionStorage.removeItem('invitation_type');
        setError('Google sign-up failed. Please try again.');
        toast.error('Google sign-up failed. Please try again.');
      }
    } catch (error) {
      console.error('Google sign-up exception:', error);
      sessionStorage.removeItem('oauth_redirect');
      sessionStorage.removeItem('invitation_token');
      sessionStorage.removeItem('invitation_type');
      setError('Google sign-up failed. Please try again.');
      toast.error('Google sign-up failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLinkedInSignUp = async () => {
    if (!invitation) return;
    
    try {
      setLinkedInLoading(true);
      setError(null);
      
      // Set flag and store invitation token to indicate OAuth redirect is happening
      sessionStorage.setItem('oauth_redirect', 'true');
      sessionStorage.setItem('invitation_token', invitation.token);
      sessionStorage.setItem('invitation_type', 'alumni');

      console.log('Initiating LinkedIn OAuth with alumni invitation:', {
        token: invitation.token,
        type: 'alumni',
        chapter_id: invitation.chapter_id,
        chapter_name: invitation.chapter_name
      });

      const callback = new URL(`${window.location.origin}/auth/callback`);
      callback.searchParams.set('invitation_token', invitation.token);
      callback.searchParams.set('invitation_type', 'alumni');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'linkedin_oidc',
        options: {
          redirectTo: callback.toString(),
          scopes: 'openid profile email',
          queryParams: {
            invitation_token: invitation.token,
            invitation_type: 'alumni',
          },
        },
      });
        
      if (error) {
        console.error('LinkedIn sign-up error:', error);
        sessionStorage.removeItem('oauth_redirect');
        sessionStorage.removeItem('invitation_token');
        sessionStorage.removeItem('invitation_type');
        setError('LinkedIn sign-up failed. Please try again.');
        toast.error('LinkedIn sign-up failed. Please try again.');
      }
    } catch (error) {
      console.error('LinkedIn sign-up exception:', error);
      sessionStorage.removeItem('oauth_redirect');
      sessionStorage.removeItem('invitation_token');
      sessionStorage.removeItem('invitation_type');
      setError('LinkedIn sign-up failed. Please try again.');
      toast.error('LinkedIn sign-up failed. Please try again.');
    } finally {
      setLinkedInLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-accent-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
              <div className="text-center">
                <h3 className="text-sm font-medium text-gray-900">Loading Alumni Invitation</h3>
                <p className="text-xs text-gray-600">Fetching invitation data...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-accent-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span>Invalid Alumni Invitation</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              {error || 'This alumni invitation link is invalid or has expired.'}
            </p>
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Possible reasons:</p>
              <ul className="text-sm text-gray-500 list-disc list-inside space-y-1">
                <li>The alumni invitation has expired</li>
                <li>The alumni invitation has been deactivated</li>
                <li>The alumni invitation has reached its usage limit</li>
                <li>The link was copied incorrectly</li>
              </ul>
            </div>
            <Button
              onClick={() => router.push('/')}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signupSuccess && showApprovalPending) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-accent-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-amber-700">
              <Clock className="h-5 w-5" />
              <span>Approval pending</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              Your alumni account is created. Chapter leadership must approve your membership before you have
              full chapter access. Complete your profile while you wait—we&apos;ll notify you when you&apos;re
              approved.
            </p>
            <Button
              onClick={() => router.push('/onboarding')}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              Continue to onboarding
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signupSuccess && !showApprovalPending) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-accent-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span>Welcome to {invitation.chapter_name} alumni!</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              Your account is ready. Taking you to finish setup…
            </p>
            <div className="flex justify-center py-2">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" aria-hidden />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showJoinForm) {
    return (
      <AlumniJoinForm
        invitation={invitation}
        onSuccess={handleJoinSuccess}
        onCancel={() => setShowJoinForm(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-50 to-purple-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full"
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-brand-accent" />
              <span>Join {invitation.chapter_name}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div>
              <p className="text-gray-600 mb-4">
                You've been invited to join {invitation.chapter_name} as an alumni member. 
                Create your account to get started.
              </p>
            </div>

            {invitation.approval_mode === 'pending' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
                <p className="text-sm text-amber-900">
                  <strong>Heads up:</strong> After you sign up, chapter leadership must approve your membership
                  before you have full chapter access.
                </p>
              </div>
            )}

            {invitation.single_use && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Each email address can only use this invitation once. Make sure to use your correct email address.
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">Or</span>
              </div>
            </div>

            {/* Authentication Options */}
            <div className="space-y-3">
              <Button
                onClick={handleGoogleSignUp}
                disabled={googleLoading || linkedInLoading}
                className="w-full h-11 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium text-left px-4 text-sm shadow-sm hover:shadow-md transition-all duration-200 bg-white"
              >
                <img 
                  src="https://developers.google.com/identity/images/g-logo.png" 
                  alt="Google" 
                  className="w-5 h-5 mr-3"
                />
                {googleLoading ? 'Connecting...' : 'Continue with Google'}
              </Button>

              {/* Temporarily disabled: LinkedIn OAuth on alumni invitation flow (mobile/desktop) - re-enable when ready */}
              {/*
              <Button
                onClick={handleLinkedInSignUp}
                disabled={linkedInLoading || googleLoading}
                className="w-full h-11 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium text-left px-4 text-sm shadow-sm hover:shadow-md transition-all duration-200 bg-white"
              >
                {linkedInIconError ? (
                  <Linkedin className="h-5 w-5 mr-3 text-gray-600" />
                ) : (
                  <img
                    src="/linkedin-icon.png"
                    alt="LinkedIn"
                    className="w-5 h-5 mr-3"
                    onError={() => setLinkedInIconError(true)}
                  />
                )}
                {linkedInLoading ? 'Connecting...' : 'Continue with LinkedIn'}
              </Button>
              */}

              <Button
                onClick={handleStartJoin}
                disabled={linkedInLoading || googleLoading}
                className="w-full h-11 rounded-full bg-brand-accent hover:bg-brand-accent-hover text-white font-medium shadow-sm hover:shadow-md transition-all duration-200"
              >
                <Mail className="h-4 w-4 mr-2" />
                Continue with Email
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
