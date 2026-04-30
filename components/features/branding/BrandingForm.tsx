'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, X, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';
import type { ChapterBranding } from '@/types/branding';
import { brandingToTheme, DEFAULT_BRANDING_THEME, isValidHexColor, normalizeHexColor } from '@/types/branding';
import { LogoUploader } from './LogoUploader';
import type { LogoCropMode } from './LogoCropper';
import { ColorPicker } from './ColorPicker';
import { BrandingPreview } from './BrandingPreview';

interface BrandingFormProps {
  /** Initial branding data for edit mode (optional) */
  initialData?: ChapterBranding | null;
  /** Chapter ID for the branding */
  chapterId: string;
  /** Callback when form is submitted */
  onSubmit: (data: Partial<ChapterBranding>) => Promise<void>;
  /** Callback when form is cancelled */
  onCancel: () => void;
  /** Additional className */
  className?: string;
  /**
   * Primary logo raster crop: `square` (1:1) for developer branding tools only.
   * Chapter admin branding omits this and keeps horizontal header crop.
   */
  primaryLogoRasterCropMode?: LogoCropMode;
}

/**
 * BrandingForm Component
 * 
 * A comprehensive form for creating/editing chapter branding.
 * Combines logo uploads, color selection, and live preview.
 */
export function BrandingForm({
  initialData,
  chapterId,
  onSubmit,
  onCancel,
  className,
  primaryLogoRasterCropMode = 'horizontal',
}: BrandingFormProps) {
  // Form state
  const [formData, setFormData] = useState<Partial<ChapterBranding>>({
    primary_logo_url: null,
    secondary_logo_url: null,
    logo_alt_text: 'Chapter Logo',
    primary_color: null,
    accent_color: null,
    organization_id: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form data from initialData
  useEffect(() => {
    if (initialData) {
      setFormData({
        primary_logo_url: initialData.primary_logo_url,
        secondary_logo_url: initialData.secondary_logo_url,
        logo_alt_text: initialData.logo_alt_text || 'Chapter Logo',
        primary_color: initialData.primary_color,
        accent_color: initialData.accent_color,
        organization_id: initialData.organization_id,
      });
      setHasChanges(false);
    }
  }, [initialData]);

  // Generate branding theme for preview
  const previewTheme = useMemo(() => {
    // Create a complete ChapterBranding object from form data for brandingToTheme
    // Merge with initialData to preserve fields not in the form
    const brandingData: ChapterBranding = {
      id: initialData?.id || '',
      chapter_id: chapterId,
      primary_logo_url: formData.primary_logo_url ?? initialData?.primary_logo_url ?? null,
      secondary_logo_url: formData.secondary_logo_url ?? initialData?.secondary_logo_url ?? null,
      logo_alt_text: formData.logo_alt_text || initialData?.logo_alt_text || 'Chapter Logo',
      primary_color: formData.primary_color ?? initialData?.primary_color ?? null,
      accent_color: formData.accent_color ?? initialData?.accent_color ?? null,
      organization_id: formData.organization_id ?? initialData?.organization_id ?? null,
      created_at: initialData?.created_at || new Date().toISOString(),
      updated_at: initialData?.updated_at || new Date().toISOString(),
      created_by: initialData?.created_by || null,
      updated_by: initialData?.updated_by || null,
    };

    return brandingToTheme(brandingData);
  }, [formData, chapterId, initialData]);

  /**
   * Update form field
   */
  const updateField = (field: keyof ChapterBranding, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);

    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  /**
   * Validate form
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Logo alt text is required if any logo is present
    if ((formData.primary_logo_url || formData.secondary_logo_url) && !formData.logo_alt_text?.trim()) {
      newErrors.logo_alt_text = 'Logo alt text is required when logos are present';
    }

    // Validate logo alt text length
    if (formData.logo_alt_text && formData.logo_alt_text.length > 100) {
      newErrors.logo_alt_text = 'Logo alt text must be 100 characters or less';
    }

    // Validate primary color if provided
    if (formData.primary_color && !isValidHexColor(formData.primary_color)) {
      newErrors.primary_color = 'Invalid primary color format';
    }

    // Validate accent color if provided
    if (formData.accent_color && !isValidHexColor(formData.accent_color)) {
      newErrors.accent_color = 'Invalid accent color format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setLoading(true);

    try {
      // Normalize colors before submission
      const submitData: Partial<ChapterBranding> = {
        ...formData,
        primary_color: formData.primary_color ? normalizeHexColor(formData.primary_color) : null,
        accent_color: formData.accent_color ? normalizeHexColor(formData.accent_color) : null,
        logo_alt_text: formData.logo_alt_text || 'Chapter Logo',
      };

      await onSubmit(submitData);
      
      toast.success(initialData ? 'Branding updated successfully!' : 'Branding created successfully!');
      setHasChanges(false);
    } catch (error) {
      console.error('Error submitting branding form:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save branding';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle cancel
   */
  const handleCancel = () => {
    if (hasChanges) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to cancel?');
      if (!confirmed) return;
    }
    onCancel();
  };

  return (
    <Card className={cn('p-6', className)}>
      <CardHeader className="pb-2 pt-1">
        <CardTitle className="text-2xl font-bold">
          {initialData ? 'Edit Chapter Branding' : 'Create Chapter Branding'}
        </CardTitle>
        <p className="text-gray-600 mt-1 text-sm">Customize the visual identity for your chapter.</p>
      </CardHeader>
      <CardContent className="p-0 pt-2">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Form Fields */}
            <div className="space-y-4">
          {/* Primary Logo */}
          <LogoUploader
            variant="primary"
            chapterId={chapterId}
            currentLogoUrl={formData.primary_logo_url || null}
            defaultLogoUrl={DEFAULT_BRANDING_THEME.primaryLogo}
            rasterCropMode={primaryLogoRasterCropMode}
            onUploadComplete={(url) => {
              updateField('primary_logo_url', url);
            }}
            onRemove={() => {
              updateField('primary_logo_url', null);
            }}
          />

          {/* Secondary Logo */}
          <LogoUploader
            variant="secondary"
            chapterId={chapterId}
            currentLogoUrl={formData.secondary_logo_url || null}
            defaultLogoUrl={null}
            onUploadComplete={(url) => {
              updateField('secondary_logo_url', url);
            }}
            onRemove={() => {
              updateField('secondary_logo_url', null);
            }}
          />

          {/* Logo Alt Text */}
          <div className="space-y-2">
            <Label htmlFor="logo_alt_text" className="text-sm font-medium text-gray-700">
              Logo Alt Text
            </Label>
            <Input
              id="logo_alt_text"
              value={formData.logo_alt_text || ''}
              onChange={(e) => updateField('logo_alt_text', e.target.value)}
              placeholder="Chapter Logo"
              maxLength={100}
              className={cn(errors.logo_alt_text && 'border-red-500')}
              aria-label="Logo alt text"
            />
            {errors.logo_alt_text && (
              <p className="text-sm text-red-600">{errors.logo_alt_text}</p>
            )}
            <p className="text-xs text-gray-500">
              Descriptive text for screen readers (max 100 characters)
            </p>
          </div>

          {/* Primary Color */}
          <ColorPicker
            value={formData.primary_color || DEFAULT_BRANDING_THEME.primaryColor}
            onChange={(color) => updateField('primary_color', color)}
            label="Primary Color"
            defaultValue={DEFAULT_BRANDING_THEME.primaryColor}
          />
          {errors.primary_color && (
            <p className="text-sm text-red-600 -mt-4">{errors.primary_color}</p>
          )}

          {/* Accent Color */}
          <ColorPicker
            value={formData.accent_color || DEFAULT_BRANDING_THEME.accentColor}
            onChange={(color) => updateField('accent_color', color)}
            label="Accent Color"
            defaultValue={DEFAULT_BRANDING_THEME.accentColor}
          />
          {errors.accent_color && (
            <p className="text-sm text-red-600 -mt-4">{errors.accent_color}</p>
          )}
        </div>

        {/* Right Column: Preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <BrandingPreview branding={previewTheme} />
        </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={loading}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !hasChanges}
                style={{
                  backgroundColor: formData.primary_color || DEFAULT_BRANDING_THEME.primaryColor,
                  color: 'white',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = previewTheme.primaryColorHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = formData.primary_color || DEFAULT_BRANDING_THEME.primaryColor;
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {initialData ? 'Update Branding' : 'Create Branding'}
                  </>
                )}
              </Button>
            </div>
        </form>
      </CardContent>
    </Card>
  );
}

