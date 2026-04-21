'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useOnboarding } from '@/lib/hooks/useOnboarding';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import {
  CheckCircle2,
  ArrowRight,
  Loader2,
  Users,
  Calendar,
  MessageSquare,
  Briefcase,
  User
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { isAwaitingChapterMembershipApproval } from '@/lib/utils/marketingAlumniOnboarding';

// ============================================================================
// Component
// ============================================================================

export default function OnboardingCompletePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { finishOnboarding } = useOnboarding();

  const [isFinishing, setIsFinishing] = useState(false);
  const [acceptedCommunityTerms, setAcceptedCommunityTerms] = useState(false);

  // Fire confetti on mount
  useEffect(() => {
    // Small delay for better UX
    const timer = setTimeout(() => {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FF6B35', '#FF8C5A', '#FFB088', '#4F46E5', '#6366F1'],
      });
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  // Get user info
  const firstName = profile?.first_name || user?.user_metadata?.given_name || 'there';
  const fullName = profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'User';
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.picture;
  const role = profile?.role === 'alumni' ? 'Alumni' : profile?.role === 'active_member' ? 'Active Member' : 'Member';
  const chapter = profile?.chapter || 'Your Chapter';

  // Get initials for avatar fallback
  const getInitials = () => {
    const first = profile?.first_name?.[0] || '';
    const last = profile?.last_name?.[0] || '';
    return (first + last).toUpperCase();
  };

  // Handle go to dashboard
  const handleGoToDashboard = async () => {
    if (!acceptedCommunityTerms) return;
    setIsFinishing(true);
    try {
      await finishOnboarding({
        communityTermsAcceptedAt: new Date().toISOString(),
      });
      // finishOnboarding handles the redirect
    } catch (error) {
      console.error('Error finishing onboarding:', error);
      if (profile && isAwaitingChapterMembershipApproval(profile)) {
        router.replace('/onboarding/pending-chapter-approval');
      } else {
        router.push('/dashboard');
      }
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4">
      {/* Success Icon */}
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-gray-100">
          <Image
            src="/logo.png"
            alt="Trailblaize"
            width={80}
            height={80}
            className="object-contain"
          />
        </div>
        <div className="absolute -top-2 -right-2">
          <div className="w-8 h-8 bg-green-100 rounded-full p-1 shadow-md flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
        </div>
      </div>

      {/* Welcome Message */}
      <h1 className="text-3xl font-bold text-gray-900 text-center mb-2">
        Welcome to Trailblaize, {firstName}!
      </h1>
      <p className="text-lg text-gray-600 text-center mb-8">
        Your profile is all set up and ready to go
      </p>

      {/* Profile Summary Card */}
      <Card className="w-full max-w-md mb-8">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-6">
          <Avatar className="h-16 w-16 border-2 border-brand-primary">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
            <AvatarFallback className="text-xl bg-gradient-to-br from-brand-primary to-brand-primary-dark text-white">
              {getInitials() || <User className="h-7 w-7" />}
            </AvatarFallback>
          </Avatar>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{fullName}</h2>
              <p className="text-sm text-gray-600">{role} • {chapter}</p>
            </div>
          </div>

          {/* Quick Stats / What's Next */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-3">What you can do now:</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Users className="h-4 w-4 text-brand-primary" />
                <span>Connect with alumni</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Calendar className="h-4 w-4 text-brand-primary" />
                <span>Join events</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <MessageSquare className="h-4 w-4 text-brand-primary" />
                <span>Send messages</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Briefcase className="h-4 w-4 text-brand-primary" />
                <span>Explore opportunities</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Community / UGC terms (explicit acceptance before dashboard — App Store UGC safety) */}
      <div className="w-full max-w-md mb-6 rounded-xl border border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-700">
        <p className="mb-3">
          Feeds, messages, and other community features depend on everyone following chapter and platform
          rules. <strong>There is no tolerance</strong> for abusive behavior or objectionable content.
        </p>
        <div className="flex items-start gap-3">
          <Checkbox
            id="onboarding-community-terms"
            checked={acceptedCommunityTerms}
            onCheckedChange={(checked) => setAcceptedCommunityTerms(checked === true)}
            disabled={isFinishing}
            className="mt-0.5"
          />
          <div className="grid gap-1.5 leading-snug">
            <Label htmlFor="onboarding-community-terms" className="text-sm font-medium text-gray-900 cursor-pointer">
              I have read and agree to the{' '}
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-primary hover:text-brand-primary-hover underline"
              >
                Terms of Service
              </Link>
              , including the community and user-generated content standards described there.
            </Label>
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <Button
        onClick={handleGoToDashboard}
        disabled={isFinishing || !acceptedCommunityTerms}
        size="lg"
        className="bg-brand-primary hover:bg-brand-primary-hover text-lg px-8 py-6 rounded-full"
      >
        {isFinishing ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Setting up...
          </>
        ) : (
          <>
            Go to Dashboard
            <ArrowRight className="ml-2 h-5 w-5" />
          </>
        )}
      </Button>

      {/* Subtle note */}
      <p className="text-sm text-gray-500 mt-4 text-center">
        You can always update your profile later
      </p>
    </div>
  );
}
