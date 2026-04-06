'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/supabase/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Mail, Info, Users, ArrowLeft, Linkedin } from 'lucide-react';
import { LottiePlayer } from '@/components/ui/LottiePlayer';
import { MobileAuthLoadingOverlay } from '@/components/features/splash/MobileAuthLoadingOverlay';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { supabase } from '@/lib/supabase/client';
import {
  OAUTH_SIGNUP_ROLE_COOKIE,
  OAUTH_POST_LOGIN_REDIRECT_MAX_AGE_SEC,
} from '@/lib/utils/oauthPostLoginRedirect';
import { isEduEmail, EDU_SIGNUP_ERROR } from '@/lib/utils/emailUtils';

const MOBILE_OVERLAY_MIN_MS = 6000;

function persistOAuthSignupRoleAlumni() {
  if (typeof window === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${OAUTH_SIGNUP_ROLE_COOKIE}=alumni; Path=/; Max-Age=${OAUTH_POST_LOGIN_REDIRECT_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}
import { useChapters } from '@/lib/hooks/useChapters';
import { Chapter } from '@/types/chapter';
import { Checkbox } from '@/components/ui/checkbox';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [chapter, setChapter] = useState('');
  // Phone number opt-in / opt-out
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);

  const [isTermsAccepted, setIsTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const { signUp, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [minOverlayTimeElapsed, setMinOverlayTimeElapsed] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinOverlayTimeElapsed(true), MOBILE_OVERLAY_MIN_MS);
    return () => clearTimeout(t);
  }, []);
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [linkedInIconError, setLinkedInIconError] = useState(false);
  
  // Use the chapters hook to fetch dynamic data
  const { chapters, loading: chaptersLoading, error: chaptersError } = useChapters();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      const checkOnboarding = async () => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('onboarding_completed')
            .eq('id', user.id)
            .single();
  
          if (profile?.onboarding_completed) {
            router.push('/dashboard');
          } else {
            router.push('/onboarding');
          }
        } catch {
          router.push('/onboarding');
        }
      };
      checkOnboarding();
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const isValidPhone = phoneNumber && phoneNumber.replace(/\D/g, '').length === 10;
    if (!email || !password || !firstName || !lastName || !chapter || !phoneNumber || !isValidPhone) {
      setError(phoneNumber && !isValidPhone ? 'Please enter a complete 10-digit phone number' : 'All fields are required');
      setLoading(false);
      return;
    }

    if (isEduEmail(email)) {
      setError(EDU_SIGNUP_ERROR);
      setLoading(false);
      return;
    }

    try {
      await signUp(email, password, {
        fullName: `${firstName} ${lastName}`,
        firstName,
        lastName,
        chapter,
        role: 'Alumni',
        phone: phoneNumber,
        smsConsent: smsConsent
      });
      setSuccess('Account created successfully! Redirecting to onboarding...');
      
      setTimeout(() => {
        window.location.href = '/onboarding';
      }, 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      setLoading(true);
      setError('');

      persistOAuthSignupRoleAlumni();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('Google sign-up error:', error);
        setError('Google sign-up failed. Please try again.');
      }
    } catch (error) {
      console.error('Google sign-up exception:', error);
      setError('Google sign-up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkedInSignUp = async () => {
    try {
      setLinkedInLoading(true);
      setError('');

      persistOAuthSignupRoleAlumni();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'linkedin_oidc',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'openid profile email',
        },
      });

      if (error) {
        console.error('LinkedIn sign-up error:', error);
        setError('LinkedIn sign-up failed. Please try again.');
      }
    } catch (error) {
      console.error('LinkedIn sign-up exception:', error);
      setError('LinkedIn sign-up failed. Please try again.');
    } finally {
      setLinkedInLoading(false);
    }
  };

  const handleEmailSignUp = () => {
    setShowEmailForm(true);
  };

  const formatPhoneNumber = (value: string) => {
    // Remove all non-numeric characters
    const phoneNumber = value.replace(/\D/g, '');
    
    // Limit to 10 digits (US phone numbers)
    const limitedPhone = phoneNumber.slice(0, 10);
    
    // Format based on length
    if (limitedPhone.length === 0) return '';
    if (limitedPhone.length < 4) return `(${limitedPhone}`;
    if (limitedPhone.length < 7) {
      return `(${limitedPhone.slice(0, 3)}) ${limitedPhone.slice(3)}`;
    }
    return `(${limitedPhone.slice(0, 3)}) ${limitedPhone.slice(3, 6)}-${limitedPhone.slice(6)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  const handleBackToLanding = () => {
    router.push('/');
  };

  const isValidPhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '')
    return digits.length === 10;
  }

  const isPhoneValid = phoneNumber === '' || isValidPhoneNumber(phoneNumber);

  const signingInOrRedirecting = loading || oauthLoading || linkedInLoading || success;
  const showMobileNetworkingOverlay = ((authLoading && !user) || (isMobile && !minOverlayTimeElapsed)) && isMobile && !signingInOrRedirecting;
  const showMobileRedirectSpinner = (user || oauthLoading || linkedInLoading) && isMobile;
  const showDesktopSpinner = authLoading || user || oauthLoading || linkedInLoading;
  
  if (showMobileNetworkingOverlay || showDesktopSpinner || showMobileRedirectSpinner) {
    return (
      <>
        <div className="lg:hidden">
          {showMobileNetworkingOverlay ? (
            <MobileAuthLoadingOverlay />
          ) : (
            <div className="min-h-screen flex items-center justify-center bg-white">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-brand-primary mx-auto mb-4" />
                <p className="text-gray-600 font-medium">
                  {user ? 'Redirecting...' : 'Completing authentication...'}
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="hidden lg:flex min-h-screen items-center justify-center bg-white">
          <div className="text-center">
            <div
              className={`animate-spin rounded-full h-12 w-12 mx-auto mb-4 ${
                user ? 'border-4 border-gray-200 border-t-brand-primary' : 'border-b-2 border-brand-primary'
              }`}
            />
            <p className="text-gray-600 font-medium">
              {user ? 'Redirecting to dashboard...' : 'Completing authentication...'}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Mobile Layout - Full Width, No Card, Vertically Centered */}
      <div className="lg:hidden w-full min-h-screen flex items-center justify-center">
        <div className="w-full p-4 sm:p-6">
          <div className="w-full max-w-sm mx-auto">
            {/* Mobile Header - Compact */}
            <div className="text-center mb-3">
              <h1 className="text-lg font-bold text-gray-900 mb-1">Welcome to Trailblaize</h1>
              <p className="text-xs text-gray-600">Create your account</p>
            </div>

            {!showEmailForm ? (
              /* Social Sign Up Options - Compact */
              <div className="space-y-2">
                <Button 
                  type="button"
                  variant="outline" 
                  className="w-full h-9 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium text-left px-3 text-sm shadow-sm hover:shadow-md transition-all duration-200"
                  onClick={handleGoogleSignUp}
                  disabled={loading || linkedInLoading}
                >
                  <img 
                    src="https://developers.google.com/identity/images/g-logo.png" 
                    alt="Google" 
                    className="w-4 h-4 mr-3"
                  />
                  Continue with Google
                </Button>
                
                {/*
                  Temporarily disabled: LinkedIn signup button (mobile)
                  Keeping handler and imports intact so we can re-enable quickly later.
                <Button 
                  type="button"
                  variant="outline" 
                  className="w-full h-9 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium text-left px-3 text-sm shadow-sm hover:shadow-md transition-all duration-200"
                  onClick={handleLinkedInSignUp}
                  disabled={loading || linkedInLoading}
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
                  {linkedInLoading ? 'Signing up...' : 'Continue with LinkedIn'}
                </Button>
                */}
                
                <Button 
                  type="button"
                  variant="outline" 
                  className="w-full h-9 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium text-left px-3 text-sm shadow-sm hover:shadow-md transition-all duration-200"
                  onClick={handleEmailSignUp}
                  disabled={loading || linkedInLoading}
                >
                  <Mail className="h-4 w-4 mr-3 text-gray-600" />
                  Continue with Email
                </Button>
              </div>
            ) : (
              /* Email Form - Full width on mobile */
              <div className="text-left">
                {/* Back Button - Compact */}
                <button
                  type="button"
                  onClick={() => setShowEmailForm(false)}
                  className="flex items-center text-xs text-gray-600 hover:text-gray-800 mb-2 transition-colors"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to sign up options
                </button>

                {/* Information Banner - Compact */}
                <div className="bg-accent-50 border border-accent-200 rounded-lg p-2 mb-3">
                  <div className="flex items-start space-x-2">
                    <Info className="h-3 w-3 text-brand-accent mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-medium text-accent-900 text-xs mb-1">Alumni Signup Only</h3>
                      <p className="text-xs text-accent-800 mb-1">
                        This signup form is for alumni only. Active members must be invited by chapter administrators.
                      </p>
                      <div className="flex items-center space-x-1 text-xs text-accent-700">
                        <Users className="h-3 w-3" />
                        <span>Need to join as an active member? Contact your chapter admin for an invitation.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rest of the form - keep existing form code */}
                <form onSubmit={handleSubmit} className="space-y-1.5">
                      {/* Name Fields - Compact */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="space-y-1">
                          <Label htmlFor="firstName" className="text-xs font-medium text-gray-700">First Name</Label>
                          <Input
                            id="firstName"
                            type="text"
                            placeholder="First Name"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            required
                            disabled={loading}
                            className="h-7 border-gray-300 focus:border-brand-primary focus:ring-brand-primary text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="lastName" className="text-xs font-medium text-gray-700">Last Name</Label>
                          <Input
                            id="lastName"
                            type="text"
                            placeholder="Last Name"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            required
                            disabled={loading}
                            className="h-7 border-gray-300 focus:border-brand-primary focus:ring-brand-primary text-sm"
                          />
                        </div>
                      </div>

                      {/* Email Field - Compact */}
                      <div className="space-y-1">
                        <Label htmlFor="email" className="text-xs font-medium text-gray-700">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="Enter your email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          disabled={loading}
                          className="h-7 border-gray-300 focus:border-brand-primary focus:ring-brand-primary text-sm"
                        />
                      </div>

                      {/* Password Field - Compact */}
                      <div className="space-y-1">
                        <Label htmlFor="password" className="text-xs font-medium text-gray-700">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="Create a password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          disabled={loading}
                          className="h-7 border-gray-300 focus:border-brand-primary focus:ring-brand-primary text-sm"
                        />
                      </div>

                      {/* Phone Number Field - Compact */}
                      <div className="space-y-1">
                        <Label htmlFor="phone" className="text-xs font-medium text-gray-700">
                          Phone Number *
                        </Label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="(555) 123-4567"
                          value={phoneNumber}
                          onChange={handlePhoneChange}
                          disabled={loading}
                          className={`h-7 border-gray-300 focus:border-brand-primary focus:ring-brand-primary text-sm ${
                            phoneNumber && !isValidPhoneNumber(phoneNumber) 
                              ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                              : ''
                          }`}
                          maxLength={14}
                          pattern="\(\d{3}\) \d{3}-\d{4}"
                          inputMode="numeric"
                        />
                        <p className="text-xs text-gray-500">
                          Get timely chapter updates and invites by text.
                        </p>
                        {phoneNumber && !isValidPhoneNumber(phoneNumber) && (
                          <p className="text-xs text-red-500">
                            Please enter a complete 10-digit phone number
                          </p>
                        )}
                      </div>

                      {/* SMS Consent Checkbox - Updated for compliance */}
                      <div className="space-y-1">
                        <div className="flex items-start space-x-2">
                          <Checkbox
                            id="sms-consent"
                            checked={smsConsent}
                            onCheckedChange={(checked) => setSmsConsent(checked === true)}
                            className="mt-0.5"
                            disabled={loading}
                          />
                          <div className="grid gap-1 leading-none">
                            <Label
                              htmlFor="sms-consent"
                              className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Sign me up for SMS so I get immediate chapter updates & notifcations.
                            </Label>
                            <p className="text-xs text-gray-500">
                              Message frequency may vary. Standard Message and Data Rates may apply.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Chapter Selection - Compact */}
                      <div className="space-y-1">
                        <Label htmlFor="chapter" className="text-xs font-medium text-gray-700">Chapter</Label>
                        <Select 
                          value={chapter} 
                          onValueChange={setChapter}
                        >
                          <SelectItem value="">
                            {chaptersLoading ? 'Loading chapters...' : 'Select your chapter'}
                          </SelectItem>
                          {chapters.map((chapterData) => (
                            <SelectItem key={chapterData.id} value={chapterData.name}>
                              {chapterData.name}
                            </SelectItem>
                          ))}
                        </Select>
                        {chaptersError && (
                          <p className="text-red-500 text-xs">Failed to load chapters. Please refresh the page.</p>
                        )}
                        {chapters.length === 0 && !chaptersLoading && (
                          <p className="text-yellow-500 text-xs">No chapters available. Please contact support.</p>
                        )}
                      </div>

                      {/* Error and Success Messages - Compact */}
                      {error && (
                        <div className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
                      )}
                      {success && (
                        <div className="text-green-500 text-xs bg-green-50 border border-green-200 rounded-lg p-2">{success}</div>
                      )}

                      {/* Submit Button */}
                      <div className="mt-2 lg:mt-1">
                        <Button 
                          type="submit" 
                          className="w-full h-7 rounded-full bg-brand-primary hover:bg-brand-primary-hover text-white font-medium text-sm shadow-sm hover:shadow-md transition-all duration-200" 
                          disabled={loading}
                        >
                          {loading ? 'Creating account...' : 'Create Alumni Account'}
                        </Button>
                      </div>
                    </form>

                    {/* Terms and Sign In */}
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 text-center mb-1">
                        By proceeding, you agree to our{' '}
                        <Link href="/terms" className="text-brand-primary hover:text-brand-primary-hover underline">
                          Terms of Service
                        </Link>
                      </p>
                      <p className="text-xs text-gray-600 text-center">
                        Already have an account?{' '}
                        <Link href="/sign-in" className="text-brand-primary hover:text-brand-primary-hover font-medium">
                          Sign in
                        </Link>
                      </p>
                    </div>
                  </div>
                )}

            {/* Back to Home Link - Mobile (at bottom) */}
            <div className="mt-4 text-center">
              <button
                onClick={handleBackToLanding}
                className="flex items-center justify-center text-sm text-gray-600 hover:text-gray-800 transition-colors mx-auto"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                <span className="text-base font-medium">Back to home</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout - Card Layout */}
      <div className="hidden lg:flex lg:items-center lg:justify-center lg:min-h-screen lg:p-1 lg:sm:p-2">
        <Card className="w-full max-w-5xl shadow-xl border-0 overflow-hidden">
          <CardContent className="p-0">
            <div className="flex">
              {/* Left Column - Introduction */}
              <div className="w-full lg:w-1/2 bg-gradient-to-br from-primary-50 to-accent-50 p-4 lg:p-6 flex flex-col justify-center items-center min-h-[500px]">
                <div className="text-center max-w-sm">
                  <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-4">
                    Welcome to Trailblaize
                  </h1>
                  <p className="text-base text-gray-700 mb-6 leading-relaxed">
                    Rethink the way you connect, manage, and grow your fraternity network
                  </p>
                  
                  {/* Networking Lottie - desktop only */}
                  <div className="relative w-[70%] max-w-[220px] h-[200px] mx-auto flex items-center justify-center" style={{ transform: 'scale(1.7)' }}>
                    <LottiePlayer
                      src="/animations/networking.json"
                      loop
                      className="w-full h-full"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column - Sign Up */}
              <div className="w-full lg:w-1/2 p-2 sm:p-3 lg:p-4 flex flex-col justify-center">
                <div className="w-full max-w-sm mx-auto">
                  {/* Desktop Header - Only "Get started for free" */}
                  <div className="hidden lg:block text-center mb-3">
                    <h2 className="text-lg font-bold text-gray-900">Get started for free</h2>
                  </div>

                  {!showEmailForm ? (
                    /* Social Sign Up Options - Compact */
                    <div className="space-y-2">
                      <Button 
                        type="button"
                        variant="outline" 
                        className="w-full h-9 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium text-left px-3 text-sm shadow-sm hover:shadow-md transition-all duration-200"
                        onClick={handleGoogleSignUp}
                        disabled={loading || linkedInLoading}
                      >
                        <img 
                          src="https://developers.google.com/identity/images/g-logo.png" 
                          alt="Google" 
                          className="w-4 h-4 mr-3"
                        />
                        Continue with Google
                      </Button>
                      
                      {/*
                        Temporarily disabled: LinkedIn signup button (desktop)
                        Keeping handler and imports intact so we can re-enable quickly later.
                      <Button 
                        type="button"
                        variant="outline" 
                        className="w-full h-9 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium text-left px-3 text-sm shadow-sm hover:shadow-md transition-all duration-200"
                        onClick={handleLinkedInSignUp}
                        disabled={loading || linkedInLoading}
                      >
                        {linkedInIconError ? (
                          <Linkedin className="h-4 w-4 mr-3 text-gray-600" />
                        ) : (
                          <img 
                            src="/linkedin-icon.png" 
                            alt="LinkedIn" 
                            className="w-4 h-4 mr-3"
                            onError={() => setLinkedInIconError(true)}
                          />
                        )}
                        {linkedInLoading ? 'Signing up...' : 'Continue with LinkedIn'}
                      </Button>
                      */}
                      
                      <Button 
                        type="button"
                        variant="outline" 
                        className="w-full h-9 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium text-left px-3 text-sm shadow-sm hover:shadow-md transition-all duration-200"
                        onClick={handleEmailSignUp}
                        disabled={loading || linkedInLoading}
                      >
                        <Mail className="h-4 w-4 mr-3 text-gray-600" />
                        Continue with Email
                      </Button>
    </div>
                  ) : (
                    /* Email Form - Dynamic height */
                    <div className="text-left">
                      {/* Back Button - Compact */}
                      <button
                        type="button"
                        onClick={() => setShowEmailForm(false)}
                        className="flex items-center text-xs text-gray-600 hover:text-gray-800 mb-2 transition-colors"
                      >
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to sign up options
                      </button>

                      {/* Information Banner - Compact */}
                      <div className="bg-accent-50 border border-accent-200 rounded-lg p-2 mb-3">
                        <div className="flex items-start space-x-2">
                          <Info className="h-3 w-3 text-brand-accent mt-0.5 flex-shrink-0" />
                          <div>
                            <h3 className="font-medium text-accent-900 text-xs mb-1">Alumni Signup Only</h3>
                            <p className="text-xs text-accent-800 mb-1">
                              This signup form is for alumni only. Active members must be invited by chapter administrators.
                            </p>
                            <div className="flex items-center space-x-1 text-xs text-accent-700">
                              <Users className="h-3 w-3" />
                              <span>Need to join as an active member? Contact your chapter admin for an invitation.</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <form onSubmit={handleSubmit} className="space-y-1.5 lg:space-y-3">
                        {/* Name Fields - Compact */}
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="space-y-1">
                            <Label htmlFor="firstName" className="text-xs font-medium text-gray-700">First Name</Label>
                            <Input
                              id="firstName"
                              type="text"
                              placeholder="First Name"
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              required
                              disabled={loading}
                              className="h-7 border-gray-300 focus:border-brand-primary focus:ring-brand-primary text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="lastName" className="text-xs font-medium text-gray-700">Last Name</Label>
                            <Input
                              id="lastName"
                              type="text"
                              placeholder="Last Name"
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              required
                              disabled={loading}
                              className="h-7 border-gray-300 focus:border-brand-primary focus:ring-brand-primary text-sm"
                            />
                          </div>
                        </div>

                        {/* Email Field - Compact */}
                        <div className="space-y-1">
                          <Label htmlFor="email" className="text-xs font-medium text-gray-700">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={loading}
                            className="h-7 border-gray-300 focus:border-brand-primary focus:ring-brand-primary text-sm"
                          />
                        </div>

                        {/* Password Field - Compact */}
                        <div className="space-y-1">
                          <Label htmlFor="password" className="text-xs font-medium text-gray-700">Password</Label>
                          <Input
                            id="password"
                            type="password"
                            placeholder="Create a password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={loading}
                            className="h-7 border-gray-300 focus:border-brand-primary focus:ring-brand-primary text-sm"
                          />
                        </div>

                        {/* Phone Number Field - Compact */}
                        <div className="space-y-1">
                          <Label htmlFor="phone" className="text-xs font-medium text-gray-700">
                            Phone Number *
                          </Label>
                          <Input
                            id="phone"
                            type="tel"
                            placeholder="(555) 123-4567"
                            value={phoneNumber}
                            onChange={handlePhoneChange}
                            disabled={loading}
                            className={`h-7 border-gray-300 focus:border-brand-primary focus:ring-brand-primary text-sm ${
                              phoneNumber && !isValidPhoneNumber(phoneNumber) 
                                ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                                : ''
                            }`}
                            maxLength={14}
                            pattern="\(\d{3}\) \d{3}-\d{4}"
                            inputMode="numeric"
                          />
                          <p className="text-xs text-gray-500">
                            Get timely chapter updates and invites by text
                          </p>
                          {phoneNumber && !isValidPhoneNumber(phoneNumber) && (
                            <p className="text-xs text-red-500">
                              Please enter a complete 10-digit phone number
                            </p>
                          )}
                        </div>

                        {/* SMS Consent Checkbox - Updated for compliance */}
                        <div className="space-y-1">
                          <div className="flex items-start space-x-2">
                            <Checkbox
                              id="sms-consent"
                              checked={smsConsent}
                              onCheckedChange={(checked) => setSmsConsent(checked === true)}
                              className="mt-0.5"
                              disabled={loading}
                            />
                            <div className="grid gap-1 leading-none">
                              <Label
                                htmlFor="sms-consent"
                                className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                Sign me up for SMS so I get immediate chapter updates & notifcations.
                              </Label>
                              <p className="text-xs text-gray-500">
                                Message frequency may vary. Standard Message and Data Rates may apply. Reply STOP to opt out. Reply HELP for help. Consent is not a condition of purchase. Your mobile information will not be sold or shared with third parties for promotional or marketing purposes.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Chapter Selection - Compact */}
                        <div className="space-y-1">
                          <Label htmlFor="chapter" className="text-xs font-medium text-gray-700">Chapter</Label>
                          <Select 
                            value={chapter} 
                            onValueChange={setChapter}
                          >
                            <SelectItem value="">
                              {chaptersLoading ? 'Loading chapters...' : 'Select your chapter'}
                            </SelectItem>
                            {chapters.map((chapterData) => (
                              <SelectItem key={chapterData.id} value={chapterData.name}>
                                {chapterData.name}
                              </SelectItem>
                            ))}
                          </Select>
                          {chaptersError && (
                            <p className="text-red-500 text-xs">Failed to load chapters. Please refresh the page.</p>
                          )}
                          {chapters.length === 0 && !chaptersLoading && (
                            <p className="text-yellow-500 text-xs">No chapters available. Please contact support.</p>
                          )}
                        </div>

                        {/* Error and Success Messages - Compact */}
                        {error && (
                          <div className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
                        )}
                        {success && (
                          <div className="text-green-500 text-xs bg-green-50 border border-green-200 rounded-lg p-2">{success}</div>
                        )}

                        {/* Submit Button */}
                        <div className="mt-2 lg:mt-1">
                          <Button 
                            type="submit" 
                            className="w-full h-7 rounded-full bg-brand-primary hover:bg-brand-primary-hover text-white font-medium text-sm shadow-sm hover:shadow-md transition-all duration-200" 
                            disabled={loading}
                          >
                            {loading ? 'Creating account...' : 'Create Alumni Account'}
                          </Button>
                        </div>
                      </form>

                      {/* Terms and Sign In */}
                      <div className="mt-2">
                        <p className="text-xs text-gray-500 text-center mb-1">
                          By proceeding, you agree to our{' '}
                          <Link href="/terms" className="text-brand-primary hover:text-brand-primary-hover underline">
                            Terms of Service
                          </Link>
                        </p>
                        <p className="text-xs text-gray-600 text-center">
                          Already have an account?{' '}
                          <Link href="/sign-in" className="text-brand-primary hover:text-brand-primary-hover font-medium">
                            Sign in
                          </Link>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Back to Home Link - Desktop (at bottom) */}
                  <div className="hidden lg:block mt-4">
                    <button
                      onClick={handleBackToLanding}
                      className="flex items-center text-base text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      <span className="text-lg font-medium">Back to home</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 