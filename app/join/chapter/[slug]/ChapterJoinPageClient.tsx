'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertCircle, Users, GraduationCap, Loader2, Mail, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChapterJoinForm } from '@/components/features/join/ChapterJoinForm';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'react-toastify';

interface ChapterInfo {
  id: string;
  name: string;
  chapter_name: string;
  school: string;
  university: string;
  location: string;
  slug: string;
}

type JoinRole = 'active_member' | 'alumni';

export default function ChapterJoinPageClient() {
  const params = useParams();
  const slug = params.slug as string;

  const [chapter, setChapter] = useState<ChapterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<JoinRole | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      window.history.replaceState({}, '', window.location.pathname);
    }

    const fetchChapter = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/chapter-join/${slug}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Chapter not found');
        }

        const data = await response.json();
        if (!data.valid) {
          throw new Error(data.error || 'Chapter not found');
        }

        setChapter(data.chapter);
      } catch (err) {
        console.error('Error fetching chapter:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chapter');
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchChapter();
    }
  }, [slug]);

  const handleGoogleSignUp = async () => {
    if (!chapter || !selectedRole) return;

    try {
      setGoogleLoading(true);
      setError(null);

      sessionStorage.setItem('oauth_redirect', 'true');
      sessionStorage.setItem('chapter_slug', chapter.slug);
      sessionStorage.setItem('join_role', selectedRole);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            chapter_slug: chapter.slug,
            join_role: selectedRole,
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('Google sign-up error:', error);
        sessionStorage.removeItem('oauth_redirect');
        sessionStorage.removeItem('chapter_slug');
        sessionStorage.removeItem('join_role');
        setError('Google sign-up failed. Please try again.');
        toast.error('Google sign-up failed. Please try again.');
      }
    } catch (err) {
      console.error('Google sign-up exception:', err);
      sessionStorage.removeItem('oauth_redirect');
      sessionStorage.removeItem('chapter_slug');
      sessionStorage.removeItem('join_role');
      setError('Google sign-up failed. Please try again.');
      toast.error('Google sign-up failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleJoinSuccess = (userData: { needs_approval?: boolean }) => {
    setSignupSuccess(true);
    if (!userData.needs_approval) {
      window.location.href = '/onboarding';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-6 w-6 animate-spin text-brand-accent" />
              <div className="text-center">
                <h3 className="text-sm font-medium text-gray-900">Loading Chapter</h3>
                <p className="text-xs text-gray-600">Fetching chapter information...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !chapter) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span>Chapter Not Found</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              {error || 'This chapter link is invalid or the chapter is no longer active.'}
            </p>
            <div className="text-sm text-gray-500 space-y-1">
              <p>This could happen if:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>The chapter link was copied incorrectly</li>
                <li>The chapter is no longer active</li>
                <li>The link has been changed</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-green-600">
              <UserCheck className="h-5 w-5" />
              <span>Welcome to {chapter.name}!</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              Your account has been created successfully. Redirecting you to complete your profile...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showEmailForm && selectedRole && chapter) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-50 to-purple-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <ChapterJoinForm
            chapter={chapter}
            joinRole={selectedRole}
            onSuccess={handleJoinSuccess}
            onCancel={() => setShowEmailForm(false)}
          />
        </div>
      </div>
    );
  }

  // Role selection + auth options
  if (selectedRole) {
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
                <span>Join {chapter.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-sm rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  {selectedRole === 'alumni' ? (
                    <GraduationCap className="h-4 w-4 text-brand-accent" />
                  ) : (
                    <Users className="h-4 w-4 text-brand-primary" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Joining as {selectedRole === 'alumni' ? 'Alumni Member' : 'Active Member'}
                    </p>
                    <button
                      onClick={() => setSelectedRole(null)}
                      className="text-xs text-brand-accent hover:underline"
                    >
                      Change
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-gray-600">
                Create your account to get started with {chapter.name}.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">Sign up with</span>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handleGoogleSignUp}
                  disabled={googleLoading}
                  className="w-full h-11 rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 font-medium text-left px-4 text-sm shadow-sm hover:shadow-md transition-all duration-200 bg-white"
                >
                  <img
                    src="https://developers.google.com/identity/images/g-logo.png"
                    alt="Google"
                    className="w-5 h-5 mr-3"
                  />
                  {googleLoading ? 'Connecting...' : 'Continue with Google'}
                </Button>

                <Button
                  onClick={() => setShowEmailForm(true)}
                  disabled={googleLoading}
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

  // Role selection screen
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
              <span>Join {chapter.name}</span>
            </CardTitle>
            {chapter.school && (
              <p className="text-sm text-gray-500">{chapter.school}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <p className="text-gray-600">
              How would you like to join {chapter.name}?
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setSelectedRole('active_member')}
                className="flex flex-col items-center p-6 rounded-xl border-2 border-gray-200 hover:border-brand-primary hover:bg-blue-50/50 transition-all duration-200 text-center group"
              >
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-3 group-hover:bg-blue-200 transition-colors">
                  <Users className="h-6 w-6 text-brand-primary" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Active Member</h3>
                <p className="text-xs text-gray-500">
                  Current students and active chapter members
                </p>
              </button>

              <button
                onClick={() => setSelectedRole('alumni')}
                className="flex flex-col items-center p-6 rounded-xl border-2 border-gray-200 hover:border-purple-500 hover:bg-purple-50/50 transition-all duration-200 text-center group"
              >
                <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center mb-3 group-hover:bg-purple-200 transition-colors">
                  <GraduationCap className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Alumni</h3>
                <p className="text-xs text-gray-500">
                  Graduated members staying connected
                </p>
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
