'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/supabase/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, ArrowRight, Mail, Star, Eye, EyeOff } from 'lucide-react';
import { LottiePlayer } from '@/components/ui/LottiePlayer';
import { MobileAuthLoadingOverlay } from '@/components/features/splash/MobileAuthLoadingOverlay';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { useSearchParams } from 'next/navigation';
import { getSafeRedirect } from '@/lib/utils/safeRedirect';
import {
  OAUTH_POST_LOGIN_REDIRECT_COOKIE,
  OAUTH_POST_LOGIN_REDIRECT_MAX_AGE_SEC,
} from '@/lib/utils/oauthPostLoginRedirect';

const MOBILE_OVERLAY_MIN_MS = 6000;

/** Survives OAuth round-trip when Supabase does not echo `redirect_to` on `/auth/callback`. */
function persistOAuthPostLoginRedirect(safePath: string) {
  if (typeof window === 'undefined') return;
  const value = encodeURIComponent(safePath);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${OAUTH_POST_LOGIN_REDIRECT_COOKIE}=${value}; Path=/; Max-Age=${OAUTH_POST_LOGIN_REDIRECT_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [minOverlayTimeElapsed, setMinOverlayTimeElapsed] = useState(false);
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  const safeRedirect = getSafeRedirect(redirectParam);

  useEffect(() => {
    const t = setTimeout(() => setMinOverlayTimeElapsed(true), MOBILE_OVERLAY_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      // Check onboarding status before redirecting
      const checkOnboarding = async () => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('onboarding_completed')
            .eq('id', user.id)
            .single();
  
          if (profile?.onboarding_completed) {
            router.push(safeRedirect ?? '/dashboard');
          } else {
            router.push('/onboarding');
          }
        } catch {
          // Fallback to onboarding if check fails
          router.push('/onboarding');
        }
      };
      checkOnboarding();
    }
  }, [user, authLoading, router, safeRedirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // SignInPage: Attempting sign in

    try {
      await signIn(email, password);
      // SignInPage: Sign in successful, redirecting to dashboard
      
      // Add a small delay to ensure auth state is updated
      setTimeout(async () => {
        try {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          const { data: profile } = await supabase
            .from('profiles')
            .select('onboarding_completed')
            .eq('id', currentUser?.id ?? '')
            .single();
      
          if (profile?.onboarding_completed) {
            router.push(safeRedirect ?? '/dashboard');
          } else {
            router.push('/onboarding');
          }
        } catch {
          router.push('/onboarding');
        }
      }, 100);
    } catch (error) {
      console.error('❌ SignInPage: Sign in failed:', error);
      setError(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      setError('');

      if (safeRedirect) {
        persistOAuthPostLoginRedirect(safeRedirect);
      }

      // Bare callback URL so Supabase can append ?code=&state= without clashing with redirect_to query.
      const callbackUrl = `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('Google sign-in error:', error);
        setError('Google sign-in failed. Please try again.');
      }
    } catch (error) {
      console.error('Google sign-in exception:', error);
      setError('Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLinkedInSignIn = async () => {
    try {
      setLinkedInLoading(true);
      setError('');

      if (safeRedirect) {
        persistOAuthPostLoginRedirect(safeRedirect);
      }

      const callbackUrl = `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'linkedin_oidc',
        options: {
          redirectTo: callbackUrl,
          scopes: 'openid profile email',
        },
      });

      if (error) {
        console.error('LinkedIn sign-in error:', error);
        setError('LinkedIn sign-in failed. Please try again.');
      }
    } catch (error) {
      console.error('LinkedIn sign-in exception:', error);
      setError('LinkedIn sign-in failed. Please try again.');
    } finally {
      setLinkedInLoading(false);
    }
  };

  const handleForgotPassword = () => {
    router.push('/auth/forgot-password');
  };

  const handleBackToLanding = () => {
    router.push('/');
  };

  // Networking overlay: ONLY before sign-in screen (auth check or initial 6s). NEVER when user exists (post-login redirect).
  const signingInOrRedirecting = loading || googleLoading || linkedInLoading;
  const showMobileNetworkingOverlay = ((authLoading && !user) || (isMobile && !minOverlayTimeElapsed)) && isMobile && !signingInOrRedirecting;
  // On mobile when redirecting, show simple spinner (not networking)
  const showMobileRedirectSpinner = user && isMobile;
  // Desktop: show spinner when auth loading or when user exists (redirecting after OAuth)
  const showDesktopSpinner = authLoading || user;

  if (showMobileNetworkingOverlay || showMobileRedirectSpinner || showDesktopSpinner) {
    return (
      <>
        <div className="lg:hidden">
          {showMobileNetworkingOverlay ? (
            <MobileAuthLoadingOverlay />
          ) : (
            <div className="min-h-screen flex items-center justify-center bg-white">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-brand-primary mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Redirecting...</p>
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
            <p className="text-gray-600 font-medium">{user ? 'Redirecting ...' : 'Loading...'}</p>
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
            {/* Mobile Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Trailblaize</h1>
              <p className="text-sm text-gray-600">Sign in to your account</p>
            </div>

            {/* Sign In Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading || googleLoading || linkedInLoading}
                  className="h-11 border-gray-300 focus:border-brand-primary focus:ring-brand-primary"
                />
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading || googleLoading || linkedInLoading}
                  className="h-11 pr-10 border-gray-300 focus:border-brand-primary focus:ring-brand-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              
              {/* Forgot Password Link */}
              <div className="text-right">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-brand-primary hover:text-brand-primary-hover"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                  {error}
                </div>
              )}

              {/* Continue Button */}
              <Button 
                type="submit" 
                className="w-full h-11 rounded-full bg-brand-primary hover:bg-brand-primary-hover text-white font-medium shadow-sm hover:shadow-md transition-all duration-200" 
                disabled={loading || googleLoading || linkedInLoading}
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>

            {/* Google Sign In Button */}
            <div className="mt-4">
              <Button 
                type="button"
                variant="outline" 
                className="w-full h-11 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium shadow-sm hover:shadow-md transition-all duration-200"
                onClick={handleGoogleSignIn}
                disabled={loading || googleLoading || linkedInLoading}
              >
                <img 
                  src="https://developers.google.com/identity/images/g-logo.png" 
                  alt="Google" 
                  className="w-5 h-5 mr-3"
                />
                {googleLoading ? 'Signing in...' : 'Sign in with Google'}
              </Button>
            </div>

            {/* LinkedIn Sign In Button */}
            <div className="mt-4">
              <Button 
                type="button"
                variant="outline" 
                className="w-full h-11 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium shadow-sm hover:shadow-md transition-all duration-200"
                onClick={handleLinkedInSignIn}
                disabled={loading || googleLoading || linkedInLoading}
              >
                <img 
                  src="/linkedin-icon.png" 
                  alt="LinkedIn" 
                  className="w-5 h-5 mr-3"
                />
                {linkedInLoading ? 'Signing in...' : 'Sign in with LinkedIn'}
              </Button>
            </div>

            {/* Sign Up Link */}
            <div className="text-sm text-gray-600 mt-4 text-center">
              Don't have an account?{' '}
              <Link href="/sign-up" className="text-brand-primary hover:text-brand-primary-hover font-medium">
                Sign Up
              </Link>
            </div>

            {/* Terms */}
            <p className="text-sm text-gray-600 mt-4 text-center">
              By clicking continue, you agree to our{' '}
              <Link href="/terms" className="text-brand-primary hover:text-brand-primary-hover underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-brand-primary hover:text-brand-primary-hover underline">
                Privacy Policy
              </Link>
            </p>

            {/* Back to Home Link - Mobile (at bottom) */}
            <div className="mt-6 text-center">
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
      <div className="hidden lg:flex lg:items-center lg:justify-center lg:min-h-screen lg:p-6">
        <Card className="w-full max-w-5xl shadow-xl border-0 overflow-hidden">
          <CardContent className="p-0">
          <div className="flex min-h-[500px]">
            {/* Left Column - Promotional Content */}
            <div className="hidden lg:block w-full lg:w-1/2 bg-gradient-to-br from-primary-50 to-accent-50 p-8 flex flex-col justify-center">
              <div className="text-center">
                <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
                  Welcome to Trailblaize
                </h1>
                <p className="text-lg text-gray-700 mb-6 leading-relaxed">
                  Rethink the way you connect, manage, and grow your organization's network
                </p>
                
                {/* Networking Lottie - desktop only */}
                <div className="relative w-[70%] max-w-[240px] h-[200px] mx-auto flex items-center justify-center" style={{ transform: 'scale(1.7)' }}>
                  <LottiePlayer
                    src="/animations/networking.json"
                    loop
                    className="w-full h-full"
                  />
                </div>

                {/* Trust Badges */}
                <div className="mt-6 text-center">
                  <p className="text-sm text-gray-600 mb-3">Grow Your Network At Scale</p>
                  <div className="flex items-center justify-center space-x-3">
                    <div className="w-6 h-6 bg-brand-primary rounded-lg flex items-center justify-center">
                      <Star className="h-4 w-4 text-white" />
                    </div>
                    <div className="w-6 h-6 bg-brand-accent rounded-lg flex items-center justify-center">
                      <Star className="h-4 w-4 text-white" />
                    </div>
                    <div className="w-6 h-6 bg-green-600 rounded-lg flex items-center justify-center">
                      <Star className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Login Form */}
            <div className="w-full lg:w-1/2 p-6 lg:p-8 flex flex-col justify-center">
              <div className="w-full max-w-md mx-auto">
                {/* Desktop Header */}
                <div className="hidden lg:block">
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Login</h2>
                </div>

                {/* Sign In Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading || googleLoading || linkedInLoading}
                      className="h-11 border-gray-300 focus:border-brand-primary focus:ring-brand-primary"
                    />
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading || googleLoading || linkedInLoading}
                      className="h-11 pr-10 border-gray-300 focus:border-brand-primary focus:ring-brand-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  
                  {/* Forgot Password Link */}
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-sm text-brand-primary hover:text-brand-primary-hover"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                      {error}
                    </div>
                  )}

                  {/* Continue Button */}
                  <Button 
                    type="submit" 
                    className="w-full h-11 rounded-full bg-brand-primary hover:bg-brand-primary-hover text-white font-medium shadow-sm hover:shadow-md transition-all duration-200" 
                    disabled={loading || googleLoading || linkedInLoading}
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>

                {/* Google Sign In Button */}
                <div className="mt-4">
                  <Button 
                    type="button"
                    variant="outline" 
                    className="w-full h-11 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium shadow-sm hover:shadow-md transition-all duration-200"
                    onClick={handleGoogleSignIn}
                    disabled={loading || googleLoading || linkedInLoading}
                  >
                    <img 
                      src="https://developers.google.com/identity/images/g-logo.png" 
                      alt="Google" 
                      className="w-5 h-5 mr-3"
                    />
                    {googleLoading ? 'Signing in...' : 'Sign in with Google'}
                  </Button>
                </div>

                {/* LinkedIn Sign In Button */}
                <div className="mt-4">
                  <Button 
                    type="button"
                    variant="outline" 
                    className="w-full h-11 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium shadow-sm hover:shadow-md transition-all duration-200"
                    onClick={handleLinkedInSignIn}
                    disabled={loading || googleLoading || linkedInLoading}
                  >
                    <img 
                      src="/linkedin-icon.png" 
                      alt="LinkedIn" 
                      className="w-5 h-5 mr-3"
                    />
                    {linkedInLoading ? 'Signing in...' : 'Sign in with LinkedIn'}
                  </Button>
                </div>

                {/* Sign Up Link */}
                <div className="text-sm text-gray-600 mt-4">
                  Don't have an account?{' '}
                  <Link href="/sign-up" className="text-brand-primary hover:text-brand-primary-hover font-medium">
                    Sign Up
                  </Link>
                </div>

                {/* Terms */}
                <p className="text-sm text-gray-600 mt-4 text-center">
                  By clicking continue, you agree to our{' '}
                  <Link href="/terms" className="text-brand-primary hover:text-brand-primary-hover underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-brand-primary hover:text-brand-primary-hover underline">
                    Privacy Policy
                  </Link>
                </p>

                {/* Back to Home Link - Desktop (at bottom) */}
                <div className="hidden lg:block mt-6">
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