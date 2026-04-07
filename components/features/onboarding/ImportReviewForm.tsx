'use client';

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectItem } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Briefcase,
  GraduationCap,
  MapPin,
  Building2,
  User,
  AlertTriangle,
  ChevronLeft,
  CheckCircle,
  Loader2,
  Sparkles,
  CircleUserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'react-toastify';
import {
  ParsedLinkedInData,
  ImportConfidence,
  ConfidenceLevel,
  ImportReviewFormData,
  importReviewFormSchema,
  alumniImportReviewFormSchema,
  UserRole,
  ExistingProfileData,
} from '@/types/profile-import';
import { buildIndustrySelectOptions, getGraduationYears } from '@/lib/alumniConstants';

const importReviewIndustryOptions = buildIndustrySelectOptions('Select industry...');

// ============================================================================
// Props Interface
// ============================================================================

interface ImportReviewFormProps {
  /** The parsed data from the LinkedIn PDF */
  parsedData: ParsedLinkedInData;
  /** Confidence scores for each field */
  confidence?: ImportConfidence | null;
  /** Callback when user confirms the data */
  onConfirm: (data: ImportReviewFormData) => Promise<void>;
  /** Callback when user clicks back */
  onBack: () => void;
  /** Loading state during submission */
  isSubmitting?: boolean;
  /** Additional className */
  className?: string;
  /** User role - determines which sections to show */
  userRole?: UserRole;
  /** Existing profile data to pre-populate form fields */
  existingProfileData?: ExistingProfileData;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the current/most recent experience from parsed data
 */
function getCurrentExperience(parsedData: ParsedLinkedInData) {
  if (!parsedData.experiences || parsedData.experiences.length === 0) {
    return null;
  }
  // Find current position, or use the first one (most recent)
  return parsedData.experiences.find(exp => exp.isCurrent) || parsedData.experiences[0];
}

/**
 * Get the most relevant education (typically first one)
 */
function getRelevantEducation(parsedData: ParsedLinkedInData) {
  if (!parsedData.education || parsedData.education.length === 0) {
    return null;
  }
  return parsedData.education[0];
}

/**
 * Determine border style based on confidence level
 */
function getConfidenceBorderClass(level?: ConfidenceLevel): string {
  switch (level) {
    case 'low':
      return 'border-amber-400 ring-1 ring-amber-200';
    case 'medium':
      return 'border-amber-300';
    case 'high':
    default:
      return 'border-gray-300';
  }
}

/**
 * Check if a field has low confidence
 */
function isLowConfidence(confidence: ImportConfidence | null | undefined, fieldPath: string): boolean {
  if (!confidence?.fields) return false;
  return confidence.fields[fieldPath] === 'low';
}

// ============================================================================
// Component
// ============================================================================

export function ImportReviewForm({
  parsedData,
  confidence,
  onConfirm,
  onBack,
  isSubmitting = false,
  className,
  userRole,
  existingProfileData,
}: ImportReviewFormProps) {
  // Determine if user is alumni (show job fields) or not (show education focus)
  const isAlumni = userRole === 'alumni' || !userRole; // Default to alumni behavior if role not provided

  // Get graduation years for dropdown
  const graduationYears = useMemo(() => getGraduationYears(), []);

  // Get current experience and education from parsed data
  const currentExp = useMemo(() => getCurrentExperience(parsedData), [parsedData]);
  const education = useMemo(() => getRelevantEducation(parsedData), [parsedData]);

  // Build full name from existing profile data
  const existingFullName = useMemo(() => {
    if (existingProfileData?.fullName) return existingProfileData.fullName;
    if (existingProfileData?.firstName && existingProfileData?.lastName) {
      return `${existingProfileData.firstName} ${existingProfileData.lastName}`.trim();
    }
    if (existingProfileData?.firstName) return existingProfileData.firstName;
    return '';
  }, [existingProfileData]);

  // Track which fields have suggestions from LinkedIn (different from existing data)
  // Note: fullName is NOT included - we use existing profile data only (read-only)
  const suggestions = useMemo(() => ({
    location: parsedData.location && parsedData.location !== existingProfileData?.location ? parsedData.location : null,
    field: education?.field && education.field !== existingProfileData?.major ? education.field : null,
    graduationYear: education?.endYear && education.endYear !== existingProfileData?.gradYear ? education.endYear.toString() : null,
    jobTitle: currentExp?.title && currentExp.title !== existingProfileData?.jobTitle ? currentExp.title : null,
    company: currentExp?.company && currentExp.company !== existingProfileData?.company ? currentExp.company : null,
  }), [parsedData, existingProfileData, education, currentExp]);

  // Form state - prioritize EXISTING data, fall back to PARSED data
  // For alumni: include all fields including job info
  // For active members: only include personal info and education
  // Note: fullName is NOT included in form state - displayed read-only from existingFullName
  const [formData, setFormData] = useState<ImportReviewFormData>(() => {
    const baseData: ImportReviewFormData = {
      // Note: fullName is displayed read-only, not editable
      location: existingProfileData?.location || parsedData.location || currentExp?.location || '',
      education: {
        school: education?.school || '',
        degree: education?.degree || '',
        // For active members, use existing major if available
        field: existingProfileData?.major || education?.field || '',
        graduationYear: existingProfileData?.gradYear?.toString() || education?.endYear?.toString() || '',
      },
    };

    // Add job-related fields for alumni
    if (isAlumni) {
      // Use existing industry if available
      baseData.industry = existingProfileData?.industry || '';
      baseData.currentExperience = {
        // Priority: existing data > parsed data > empty
        title: existingProfileData?.jobTitle || currentExp?.title || '',
        company: existingProfileData?.company || currentExp?.company || '',
        startMonth: currentExp?.startMonth?.toString() || '',
        startYear: currentExp?.startYear?.toString() || '',
        endMonth: currentExp?.endMonth?.toString() || '',
        endYear: currentExp?.endYear?.toString() || '',
        isCurrent: currentExp?.isCurrent ?? true,
        location: currentExp?.location || '',
        description: currentExp?.description || '',
      };
    }

    return baseData;
  });

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * Handle input changes for top-level fields
   */
  const handleChange = useCallback((field: keyof ImportReviewFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [errors]);

  /**
   * Handle input changes for experience fields (alumni only)
   */
  const handleExperienceChange = useCallback((field: string, value: string | boolean) => {
    if (!formData.currentExperience) return;

    setFormData(prev => ({
      ...prev,
      currentExperience: prev.currentExperience
        ? { ...prev.currentExperience, [field]: value }
        : undefined,
    }));
    // Clear error
    const errorKey = `currentExperience.${field}`;
    if (errors[errorKey]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[errorKey];
        return next;
      });
    }
  }, [errors, formData.currentExperience]);

  /**
   * Handle input changes for education fields
   */
  const handleEducationChange = useCallback((field: keyof ImportReviewFormData['education'], value: string) => {
    setFormData(prev => ({
      ...prev,
      education: { ...prev.education, [field]: value },
    }));
  }, []);

  /**
   * Validate form before submission
   * Uses stricter validation for alumni (requires job info)
   */
  const validateForm = (): boolean => {
    // Use appropriate schema based on user role
    const schema = isAlumni ? alumniImportReviewFormSchema : importReviewFormSchema;
    const result = schema.safeParse(formData);

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path.join('.');
        newErrors[path] = issue.message;
      });
      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await onConfirm(formData);
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('Failed to save profile. Please try again.');
    }
  };

  /**
   * Render confidence indicator badge
   */
  const renderConfidenceIndicator = (fieldPath: string) => {
    const level = confidence?.fields?.[fieldPath];
    if (level !== 'low' && level !== 'medium') return null;

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ml-2',
          level === 'low'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-yellow-50 text-yellow-700'
        )}
        title={level === 'low' ? 'This field may need review' : 'Please verify this field'}
      >
        <AlertTriangle className="h-3 w-3" />
        {level === 'low' ? 'Needs review' : 'Verify'}
      </span>
    );
  };

  /**
   * Render suggestion badge when LinkedIn data differs from existing
   */
  const renderSuggestionBadge = (suggestionValue: string | null, onApply: () => void) => {
    if (!suggestionValue) return null;

    return (
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded flex items-center gap-1">
          LinkedIn: {suggestionValue.length > 30 ? suggestionValue.substring(0, 30) + '...' : suggestionValue}
        </span>
        <button
          type="button"
          onClick={onApply}
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Use this
        </button>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          Review Your Information
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          We've extracted this from your PDF. Please review and edit as needed.
        </p>
        {confidence?.overall === 'low' && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-700 flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Some fields may need your attention (highlighted in yellow)
            </p>
          </div>
        )}
      </div>

      {/* Personal Information Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleUserRound className="h-5 w-5 text-gray-400" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {/* Full Name - Read Only (from existing profile) */}
          {existingFullName && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-brand-primary" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{existingFullName}</p>
                <p className="text-xs text-gray-500">Your profile name (from account)</p>
              </div>
            </div>
          )}

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location" className="flex items-center">
              Location
              {renderConfidenceIndicator('location')}
            </Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => handleChange('location', e.target.value)}
              placeholder="e.g., San Francisco, CA"
              className={cn(
                isLowConfidence(confidence, 'location') && getConfidenceBorderClass('low')
              )}
            />
            {renderSuggestionBadge(suggestions.location, () => handleChange('location', suggestions.location!))}
          </div>
        </CardContent>
      </Card>

      {/* Current Role Section - Only show for alumni */}
      {isAlumni && formData.currentExperience && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-5 w-5 text-gray-400" />
              Current Role
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {/* Job Title */}
            <div className="space-y-2">
              <Label htmlFor="jobTitle" className="flex items-center">
                Job Title *
                {renderConfidenceIndicator('experiences.0.title')}
              </Label>
              <Input
                id="jobTitle"
                value={formData.currentExperience.title}
                onChange={(e) => handleExperienceChange('title', e.target.value)}
                placeholder="e.g., Product Manager"
                className={cn(
                  errors['currentExperience.title'] && 'border-red-500',
                  isLowConfidence(confidence, 'experiences.0.title') && getConfidenceBorderClass('low')
                )}
              />
              {errors['currentExperience.title'] && (
                <p className="text-sm text-red-500">{errors['currentExperience.title']}</p>
              )}
              {renderSuggestionBadge(suggestions.jobTitle, () => handleExperienceChange('title', suggestions.jobTitle!))}
            </div>

            {/* Company */}
            <div className="space-y-2">
              <Label htmlFor="company" className="flex items-center">
                Company *
                {renderConfidenceIndicator('experiences.0.company')}
              </Label>
              <Input
                id="company"
                value={formData.currentExperience.company}
                onChange={(e) => handleExperienceChange('company', e.target.value)}
                placeholder="e.g., Acme Corporation"
                className={cn(
                  errors['currentExperience.company'] && 'border-red-500',
                  isLowConfidence(confidence, 'experiences.0.company') && getConfidenceBorderClass('low')
                )}
              />
              {errors['currentExperience.company'] && (
                <p className="text-sm text-red-500">{errors['currentExperience.company']}</p>
              )}
              {renderSuggestionBadge(suggestions.company, () => handleExperienceChange('company', suggestions.company!))}
            </div>

            {/* Industry */}
            <div className="space-y-2">
              <Label htmlFor="industry" className="flex items-center">
                Industry *
                {renderConfidenceIndicator('industry')}
              </Label>
              <SearchableSelect
                value={formData.industry || ''}
                onValueChange={(value) => handleChange('industry', value)}
                options={importReviewIndustryOptions}
                placeholder="Select your industry"
                searchPlaceholder="Search industries..."
                className={cn(
                  errors.industry && 'border-red-500',
                  isLowConfidence(confidence, 'industry') && 'border-amber-400'
                )}
                allowCustom
              />
              {errors.industry && (
                <p className="text-sm text-red-500">{errors.industry}</p>
              )}
            </div>

            {/* Work Location (optional) */}
            <div className="space-y-2">
              <Label htmlFor="workLocation" className="flex items-center">
                Work Location
                {renderConfidenceIndicator('experiences.0.location')}
              </Label>
              <Input
                id="workLocation"
                value={formData.currentExperience.location}
                onChange={(e) => handleExperienceChange('location', e.target.value)}
                placeholder="e.g., New York, NY (or Remote)"
                className={cn(
                  isLowConfidence(confidence, 'experiences.0.location') && getConfidenceBorderClass('low')
                )}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Education Section */}
      <Card className={cn(!isAlumni && 'border-blue-200')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className={cn('h-5 w-5', isAlumni ? 'text-gray-400' : 'text-blue-500')} />
            Education
            {!isAlumni && (
              <span className="text-xs text-blue-600 font-normal ml-2">
                (Will be saved to your profile)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {/* School */}
          <div className="space-y-2">
            <Label htmlFor="school" className="flex items-center">
              School / University
              {renderConfidenceIndicator('education.0.school')}
            </Label>
            <Input
              id="school"
              value={formData.education.school}
              onChange={(e) => handleEducationChange('school', e.target.value)}
              placeholder="e.g., University of Mississippi"
              className={cn(
                isLowConfidence(confidence, 'education.0.school') && getConfidenceBorderClass('low')
              )}
            />
          </div>

          {/* Degree */}
          <div className="space-y-2">
            <Label htmlFor="degree" className="flex items-center">
              Degree
              {renderConfidenceIndicator('education.0.degree')}
            </Label>
            <Input
              id="degree"
              value={formData.education.degree}
              onChange={(e) => handleEducationChange('degree', e.target.value)}
              placeholder="e.g., Bachelor of Science"
              className={cn(
                isLowConfidence(confidence, 'education.0.degree') && getConfidenceBorderClass('low')
              )}
            />
          </div>

          {/* Field of Study - Highlighted for active members as it maps to major */}
          <div className="space-y-2">
            <Label htmlFor="field" className="flex items-center">
              Field of Study {!isAlumni && <span className="text-blue-600 ml-1">→ Major</span>}
            </Label>
            <Input
              id="field"
              value={formData.education.field}
              onChange={(e) => handleEducationChange('field', e.target.value)}
              placeholder="e.g., Computer Science"
              className={cn(!isAlumni && 'border-blue-300 focus:border-blue-500')}
            />
            {!isAlumni && (
              <p className="text-xs text-blue-600">This will be saved as your major</p>
            )}
            {renderSuggestionBadge(suggestions.field, () => handleEducationChange('field', suggestions.field!))}
          </div>

          {/* Graduation Year - Highlighted for active members */}
          <div className="space-y-2">
            <Label htmlFor="graduationYear" className="flex items-center">
              Graduation Year
              {renderConfidenceIndicator('education.0.endYear')}
            </Label>
            <Select
              value={formData.education.graduationYear}
              onValueChange={(value) => handleEducationChange('graduationYear', value)}
              placeholder="Select year"
              className={cn(
                isLowConfidence(confidence, 'education.0.endYear') && '[&>button]:border-amber-400',
                !isAlumni && '[&>button]:border-blue-300'
              )}
            >
              <SelectItem value="">Select year...</SelectItem>
              {graduationYears.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </Select>
            {renderSuggestionBadge(suggestions.graduationYear, () => handleEducationChange('graduationYear', suggestions.graduationYear!))}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isSubmitting}
          className="flex-1 gap-2 rounded-full"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 gap-2 bg-brand-primary hover:bg-brand-primary-hover rounded-full"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4" />
              Confirm & Continue
            </>
          )}
        </Button>
      </div>

      {/* Help text */}
      <p className="text-center text-xs text-gray-400">
        You can update this information anytime in your profile settings
      </p>
    </form>
  );
}