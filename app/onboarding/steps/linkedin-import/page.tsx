'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useOnboarding } from '@/lib/hooks/useOnboarding';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { ONBOARDING_MAIN_CARD_CLASS } from '@/lib/constants/onboardingUi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProfilePdfUploader } from '@/components/features/onboarding/ProfilePdfUploader';
import { ImportReviewForm } from '@/components/features/onboarding/ImportReviewForm';
import { LinkedInPdfHelpModal } from '@/components/features/onboarding/LinkedInPdfHelpModal';
import { ParsedLinkedInData, ImportConfidence, ImportReviewFormData, UserRole, ExistingProfileData } from '@/types/profile-import';
import {
  FileText,
  Loader2,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  Upload,
  PenLine,
  Check,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type ImportStep = 'choice' | 'upload' | 'review' | 'applying';

interface AlumniData {
  company?: string;
  job_title?: string;
  industry?: string;
  location?: string;
  graduation_year?: number;
}

// ============================================================================
// Component
// ============================================================================

/**
 * LinkedIn Import Step - DISABLED
 * Redirects to profile-basics. The LinkedIn import feature is temporarily hidden.
 * The page file is kept to prevent 404s for any bookmarked/cached URLs.
 */
export default function LinkedInImportPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/onboarding/steps/profile-basics');
  }, [router]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-primary mb-4" />
      <p className="text-gray-600">Redirecting...</p>
    </div>
  );
}

function LinkedInImportPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session } = useAuth();
  const { profile, loading: profileLoading, refreshProfile } = useProfile();
  const { completeStep, skipStep, goToPreviousStep, canGoBack } = useOnboarding();
  const supabase = createClientComponentClient();

  // State
  const [currentStep, setCurrentStep] = useState<ImportStep>('choice');
  const [importId, setImportId] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedLinkedInData | null>(null);
  const [confidence, setConfidence] = useState<ImportConfidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Alumni data for pre-population
  const [alumniData, setAlumniData] = useState<AlumniData | null>(null);
  const [alumniLoading, setAlumniLoading] = useState(false);

  // Get user role
  const userRole: UserRole = (profile?.role as UserRole) || 'pending';

  // Fetch alumni data if user is alumni
  useEffect(() => {
    async function fetchAlumniData() {
      if (!profile?.id || profile.role !== 'alumni') {
        setAlumniData(null);
        return;
      }

      setAlumniLoading(true);
      try {
        const { data, error } = await supabase
          .from('alumni')
          .select('company, job_title, industry, location, graduation_year')
          .eq('user_id', profile.id)
          .single();

        if (error) {
          console.error('Error fetching alumni data:', error);
          setAlumniData(null);
        } else {
          setAlumniData(data || null);
        }
      } catch (err) {
        console.error('Error fetching alumni data:', err);
        setAlumniData(null);
      } finally {
        setAlumniLoading(false);
      }
    }

    fetchAlumniData();
  }, [profile?.id, profile?.role, supabase]);

  // Build existing profile data for form pre-population
  const existingProfileData: ExistingProfileData = {
    fullName: profile?.full_name || undefined,
    firstName: profile?.first_name || undefined,
    lastName: profile?.last_name || undefined,
    location: alumniData?.location || profile?.location || undefined,
    major: profile?.major || undefined,
    gradYear: alumniData?.graduation_year || profile?.grad_year || undefined,
    company: alumniData?.company || undefined,
    jobTitle: alumniData?.job_title || undefined,
    industry: alumniData?.industry || undefined,
  };

  // Handle upload complete
  const handleUploadComplete = useCallback(async (importRecord: { id: string }) => {
    if (!session?.access_token) {
      setError('Not authenticated');
      return;
    }

    setImportId(importRecord.id);
    setCurrentStep('upload');
    setError(null);

    try {
      // Call parse API
      const response = await fetch('/api/profile-import/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ importId: importRecord.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse PDF');
      }

      setParsedData(data.data);
      setConfidence(data.confidence);
      setCurrentStep('review');
    } catch (err) {
      console.error('Parse error:', err);
      setError(err instanceof Error ? err.message : 'Failed to extract data from PDF');
      setCurrentStep('choice');
    }
  }, [session?.access_token]);

  // Handle confirm (apply data)
  const handleConfirm = useCallback(async (formData: ImportReviewFormData) => {
    if (!session?.access_token || !importId) {
      toast.error('Session expired. Please try again.');
      return;
    }

    setIsSubmitting(true);
    setCurrentStep('applying');

    try {
      const response = await fetch('/api/profile-import/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ importId, formData }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to apply profile data');
      }

      toast.success('Profile updated successfully!');

      await refreshProfile();

      // Complete this step and move to next
      await completeStep('linkedin-import');
    } catch (err) {
      console.error('Apply error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save profile');
      setCurrentStep('review');
    } finally {
      setIsSubmitting(false);
    }
  }, [session?.access_token, importId, completeStep, refreshProfile]);

  // Handle back from review
  const handleBackFromReview = () => {
    setParsedData(null);
    setConfidence(null);
    setCurrentStep('choice');
  };

  // Handle skip
  const handleSkip = async () => {
    await skipStep('linkedin-import');
  };

  // Handle back to previous onboarding step
  const handleBack = () => {
    goToPreviousStep();
  };

  // Handle manual fill
  const handleManualFill = async () => {
    await skipStep('linkedin-import');
  };

  // Loading state
  if (profileLoading || alumniLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
        <p className="text-gray-600 mt-4">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Choice Step */}
      {currentStep === 'choice' && (
        <>
          <Card className={ONBOARDING_MAIN_CARD_CLASS}>
            <CardHeader className="text-center pb-2">
              <CardTitle className="flex items-center justify-center gap-2">
                Import Your Profile
              </CardTitle>
              <CardDescription>
                Save time by importing your details from LinkedIn
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error Display */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* Option 1: Upload LinkedIn PDF */}
              <Card
                className={cn(
                  'cursor-pointer transition-all border-2',
                  'hover:border-brand-primary hover:shadow-md'
                )}
              >
                <CardContent className="p-4">
                  <ProfilePdfUploader
                    source="linkedin_pdf"
                    onUploadComplete={handleUploadComplete}
                    onError={(err) => setError(err)}
                    className="border-0 shadow-none p-0"
                  />
                </CardContent>
              </Card>

              {/* Help Link */}
              <div className="text-center">
                <button
                  onClick={() => setShowHelpModal(true)}
                  className="inline-flex items-center text-sm text-brand-primary hover:underline"
                >
                  <HelpCircle className="h-4 w-4 mr-1" />
                  How do I download my LinkedIn PDF?
                </button>
              </div>

              {/* Divider */}
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-4 text-sm text-gray-500">or</span>
                </div>
              </div>

              {/* Option 2: Fill Manually */}
              <Button
                variant="outline"
                onClick={handleManualFill}
                className="w-full h-auto py-4 justify-start rounded-full"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-full">
                    <PenLine className="h-5 w-5 text-gray-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Fill in manually</p>
                    <p className="text-sm text-gray-500">Enter your information step by step</p>
                  </div>
                </div>
              </Button>
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            {canGoBack ? (
              <Button variant="outline" onClick={handleBack} className="rounded-full">
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            ) : (
              <div />
            )}
            <Button variant="ghost" onClick={handleSkip} className="text-gray-500 rounded-full">
              Skip for now
            </Button>
          </div>
        </>
      )}

      {/* Upload/Processing Step */}
      {currentStep === 'upload' && (
        <Card className={ONBOARDING_MAIN_CARD_CLASS}>
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center">
              <Loader2 className="h-12 w-12 animate-spin text-brand-primary mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Processing your PDF...
              </h3>
              <p className="text-gray-500">
                Extracting your information...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review Step */}
      {currentStep === 'review' && parsedData && (
        <ImportReviewForm
          parsedData={parsedData}
          confidence={confidence}
          onConfirm={handleConfirm}
          onBack={handleBackFromReview}
          isSubmitting={isSubmitting}
          userRole={userRole}
          existingProfileData={existingProfileData}
        />
      )}

      {/* Applying Step */}
      {currentStep === 'applying' && (
        <Card className={ONBOARDING_MAIN_CARD_CLASS}>
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center">
              <Loader2 className="h-12 w-12 animate-spin text-brand-primary mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Updating your profile...
              </h3>
              <p className="text-gray-500">
                Saving your information
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Modal */}
      <LinkedInPdfHelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />
    </div>
  );
}
