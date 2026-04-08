'use client';

import { createContext, useContext, useEffect, useMemo, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { ActivityTypes, trackActivity } from '@/lib/utils/activityUtils';
import { generateUniqueUsername, generateProfileSlug } from '@/lib/utils/usernameUtils';
import { isEduEmail, EDU_SIGNUP_ERROR } from '@/lib/utils/emailUtils';
import { supabase } from './client';
import { clearFeedCache } from '@/lib/cache/feedCache';
interface ProfileData {
  fullName: string;
  firstName: string;
  lastName: string;
  chapter: string;
  role: 'Admin / Executive' | 'Active Member' | 'Alumni';
  phone?: string;
  smsConsent?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, profileData?: ProfileData) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithLinkedIn: () => Promise<void>;
  getAuthHeaders: () => Record<string, string>;
  /**
   * When React state lags storage (e.g. SSR-hydrated dashboard), reads session from the
   * browser client and syncs context. Use before authenticated API calls from the feed.
   */
  refreshClientSessionIfNeeded: () => Promise<boolean>;
  /** Bearer headers for fetch; falls back to supabase.auth.getSession() when context has no token. */
  getAuthHeadersAsync: () => Promise<Record<string, string>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const syncExistingAlumni = async (userId: string) => {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('❌ AuthContext: Profile fetch failed:', profileError);
      return;
    }

    if (profile?.role?.toLowerCase() === 'alumni') {
      const { data: existingAlumni, error: alumniCheckError } = await supabase
        .from('alumni')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (alumniCheckError && alumniCheckError.code !== 'PGRST116') {
        console.error('❌ AuthContext: Alumni check failed:', alumniCheckError);
        return;
      }

      if (!existingAlumni) {
        const { error: alumniError } = await supabase.from('alumni').insert({
          user_id: userId,
          first_name: profile.first_name,
          last_name: profile.last_name,
          full_name: profile.full_name,
          chapter: profile.chapter,
          industry: 'Not specified',
          graduation_year: new Date().getFullYear(),
          company: 'Not specified',
          job_title: 'Not specified',
          email: profile.email,
          phone: null,
          location: 'Not specified',
          description: `Alumni from ${profile.chapter}`,
          avatar_url: null,
          verified: false,
          is_actively_hiring: false,
          last_contact: null,
          tags: null,
          mutual_connections: [],
        });

        if (alumniError) {
          console.error('❌ AuthContext: Missing alumni record creation failed:', alumniError);
        }
      }
    }
  } catch (error) {
    console.error('❌ AuthContext: Alumni sync exception:', error);
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initializeAuth = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        setError(error.message);
      }

      setSession(session ?? null);
      setUser(session?.user ?? null);
    } catch (authError) {
      const message =
        authError instanceof Error ? authError.message : 'Failed to initialize auth session';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      setSession(currentSession ?? null);
      setUser(currentSession?.user ?? null);
      setLoading(false);

      if (event === 'SIGNED_IN' && currentSession?.user) {
        try {
          await trackActivity(currentSession.user.id, ActivityTypes.LOGIN, {
            loginMethod: 'session_restore',
            timestamp: new Date().toISOString(),
          });
        } catch (activityError) {
          console.error('Failed to track automatic login activity:', activityError);
        }
      }

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setSession(null);
        setError(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [initializeAuth]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);

      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          setError(error.message);
          throw error;
        }

        if (data.user) {
          await syncExistingAlumni(data.user.id);

          try {
            await trackActivity(data.user.id, ActivityTypes.LOGIN, {
              loginMethod: 'email',
              timestamp: new Date().toISOString(),
            });
          } catch (activityError) {
            console.error('AuthContext: Failed to track login activity:', activityError);
          }
        }

        setSession(data.session ?? null);
        setUser(data.user ?? null);
      } catch (signInError) {
        const message = signInError instanceof Error ? signInError.message : 'Failed to sign in';
        setError(message);
        throw signInError;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const signUp = useCallback(async (email: string, password: string, profileData?: ProfileData) => {
    setLoading(true);
    setError(null);

    try {
      if (isEduEmail(email)) {
        setError(EDU_SIGNUP_ERROR);
        throw new Error(EDU_SIGNUP_ERROR);
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        console.error('❌ AuthContext: Sign up failed:', error);
        setError(error.message);
        throw error;
      }

      if (data.user) {
        try {
          const fullName = profileData
            ? `${profileData.firstName} ${profileData.lastName}`
            : data.user.email?.split('@')[0] || 'User';
          
          const normalizedRole = profileData?.role
            ? (profileData.role.toLowerCase() === 'alumni' ? 'alumni' : profileData.role.toLowerCase())
            : null;

          // Generate username
          const username = await generateUniqueUsername(
            supabase,
            profileData?.firstName || null,
            profileData?.lastName || null,
            data.user.id
          );
          const profileSlug = generateProfileSlug(username);

          const { error: profileError } = await supabase
            .from('profiles')
            .upsert(
              {
                id: data.user.id,
                email: data.user.email,
                full_name: fullName,
                first_name: profileData?.firstName || null,
                last_name: profileData?.lastName || null,
                username: username,
                profile_slug: profileSlug,
                chapter: profileData?.chapter || null,
                role: normalizedRole,
                phone: profileData?.phone || null,
                sms_consent: profileData?.smsConsent || false,
                // TRA-576: /sign-up passes profileData — enables POST /api/chapter-membership-requests
                ...(profileData ? { signup_channel: 'marketing_alumni' as const } : {}),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: 'id',
              }
            );

          if (profileError) {
            console.error('❌ AuthContext: Profile creation failed:', profileError);
          } else if (profileData?.role?.toLowerCase() === 'alumni') {
            try {
              const cleanPhone = profileData?.phone 
                ? profileData.phone.replace(/\D/g, '') 
                : null;

              const { error: alumniError } = await supabase
                .from('alumni')
                .upsert(
                  {
                    user_id: data.user.id,
                    first_name: profileData.firstName,
                    last_name: profileData.lastName,
                    full_name: fullName,
                    chapter: profileData.chapter,
                    industry: 'Not specified',
                    graduation_year: new Date().getFullYear(),
                    company: 'Not specified',
                    job_title: 'Not specified',
                    email: data.user.email,
                    phone: cleanPhone || null,
                    location: 'Not specified',
                    description: `Alumni from ${profileData.chapter}`,
                    avatar_url: null,
                    verified: false,
                    is_actively_hiring: false,
                    last_contact: null,
                    tags: null,
                    mutual_connections: [],
                  },
                  {
                    onConflict: 'user_id',
                    ignoreDuplicates: false,
                  }
                );

              if (alumniError) {
                console.error('❌ AuthContext: Alumni record creation failed:', alumniError);
              }
            } catch (alumniError) {
              console.error('❌ AuthContext: Alumni record creation exception:', alumniError);
            }
          }
        } catch (profileError) {
          console.error('❌ AuthContext: Profile creation exception:', profileError);
        }

        try {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (signInError) {
            console.error('❌ AuthContext: Auto sign-in failed:', signInError);
            setError(signInError.message);
          }
        } catch (signInError) {
          console.error('❌ AuthContext: Auto sign-in exception:', signInError);
          setError(signInError instanceof Error ? signInError.message : 'Auto sign-in failed');
        }
      }
    } catch (error) {
      console.error('❌ AuthContext: Sign up exception:', error);
      setError(error instanceof Error ? error.message : 'Failed to sign up');
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setError(error.message);
        throw error;
      }

      setUser(null);
      setSession(null);

      clearFeedCache();
    } catch (signOutError) {
      const message = signOutError instanceof Error ? signOutError.message : 'Failed to sign out';
      setError(message);
      throw signOutError;
    } finally {
      setLoading(false);
    }
  }, []);

  const signInWithGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  };

  const signInWithLinkedIn = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'linkedin_oidc',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'openid profile email',
        },
      });

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error('LinkedIn sign-in error:', error);
      throw error;
    }
  };

  const getAuthHeaders = useCallback(() => {
    if (!session?.access_token) {
      throw new Error('Authentication required');
    }

    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  }, [session?.access_token]);

  const refreshClientSessionIfNeeded = useCallback(async (): Promise<boolean> => {
    try {
      if (session?.access_token) return true;
      const {
        data: { session: s },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !s?.access_token) return false;
      setSession(s);
      setUser(s.user);
      return true;
    } catch {
      return false;
    }
  }, [session?.access_token]);

  const getAuthHeadersAsync = useCallback(async (): Promise<Record<string, string>> => {
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
    const {
      data: { session: s },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !s?.access_token) {
      throw new Error('AUTH_REQUIRED');
    }
    setSession(s);
    setUser(s.user);
    return { Authorization: `Bearer ${s.access_token}` };
  }, [session?.access_token]);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      error,
      signIn,
      signUp,
      signOut,
      signInWithGoogle,
      signInWithLinkedIn,
      getAuthHeaders,
      refreshClientSessionIfNeeded,
      getAuthHeadersAsync,
    }),
    [
      error,
      getAuthHeaders,
      getAuthHeadersAsync,
      loading,
      refreshClientSessionIfNeeded,
      session,
      signIn,
      signInWithGoogle,
      signInWithLinkedIn,
      signOut,
      signUp,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
