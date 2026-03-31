'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, Loader2, X, UserPlus } from 'lucide-react';
import type { CreateRecruitRequest, Recruit } from '@/types/recruitment';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/supabase/auth-context';

interface AddRecruitFormProps {
  onSuccess?: (recruit: Recruit) => void;
  onCancel?: () => void;
  variant?: 'modal' | 'inline';
}

export function AddRecruitForm({ onSuccess, onCancel, variant = 'inline' }: AddRecruitFormProps) {
  const { session } = useAuth(); // Get session for Bearer token
  const [formData, setFormData] = useState<CreateRecruitRequest>({
    name: '',
    hometown: '',
    phone_number: '',
    instagram_handle: '',
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Phone number formatting
  const formatPhoneNumber = (value: string): string => {
    const phoneNumber = value.replace(/\D/g, '');
    const limitedPhone = phoneNumber.slice(0, 10);
    
    if (limitedPhone.length === 0) return '';
    if (limitedPhone.length < 4) return `(${limitedPhone}`;
    if (limitedPhone.length < 7) {
      return `(${limitedPhone.slice(0, 3)}) ${limitedPhone.slice(3)}`;
    }
    return `(${limitedPhone.slice(0, 3)}) ${limitedPhone.slice(3, 6)}-${limitedPhone.slice(6)}`;
  };

  // Phone number validation
  const isValidPhoneNumber = (phone: string): boolean => {
    if (!phone || phone.trim().length === 0) return true; // Optional field
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10 || digits.length === 11;
  };

  // Normalize Instagram handle (strip @ symbol)
  const normalizeInstagramHandle = (handle: string): string => {
    return handle.replace(/^@+/, '').trim();
  };

  // Handle input changes
  const handleInputChange = (field: keyof CreateRecruitRequest, value: string) => {
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    setSubmitError(null);

    // Special handling for phone number (format as user types)
    if (field === 'phone_number') {
      const formatted = formatPhoneNumber(value);
      setFormData(prev => ({ ...prev, [field]: formatted }));
    } 
    // Special handling for Instagram handle (strip @ symbol)
    else if (field === 'instagram_handle') {
      const normalized = normalizeInstagramHandle(value);
      setFormData(prev => ({ ...prev, [field]: normalized }));
    } 
    else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Name validation (required)
    if (!formData.name || !formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    // Hometown validation (required)
    if (!formData.hometown || !formData.hometown.trim()) {
      newErrors.hometown = 'Hometown is required';
    }

    // Phone number validation (optional, but if provided must be valid)
    if (formData.phone_number && formData.phone_number.trim().length > 0) {
      if (!isValidPhoneNumber(formData.phone_number)) {
        newErrors.phone_number = 'Please enter a valid 10-digit phone number';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Validate form
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // Prepare request body
      const requestBody: CreateRecruitRequest = {
        name: formData.name.trim(),
        hometown: formData.hometown.trim(),
        phone_number: formData.phone_number?.trim() || undefined,
        instagram_handle: formData.instagram_handle?.trim() || undefined,
      };

      // Prepare headers with Bearer token
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      // Add Authorization header with Bearer token if session exists
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // POST to API endpoint
      const response = await fetch('/api/recruitment/recruits', {
        method: 'POST',
        headers,
        credentials: 'include', // Also include cookies as fallback
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit recruit');
      }

      const recruit: Recruit = await response.json();

      // Show success state
      setSuccess(true);

      // Clear form
      setFormData({
        name: '',
        hometown: '',
        phone_number: '',
        instagram_handle: '',
      });

      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess(recruit);
      }

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 3000);

    } catch (error) {
      console.error('Error submitting recruit:', error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit recruit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Success message display
  if (success) {
    return (
      <Alert className="bg-green-50 border-green-200">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          <strong>Success!</strong> Recruit submitted successfully.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className={cn(
      variant === 'modal' && isMobile
        ? "w-full flex flex-col shadow-none border-0 h-full min-h-0 bg-transparent" // Remove rounded-none, let parent handle it
        : "max-w-3xl mx-auto flex flex-col", // Desktop/inline: keep max-width and centering
      variant === 'modal' && !isMobile
        ? "border border-primary-200 shadow-lg shadow-navy-200 max-h-[90vh] rounded-lg bg-white"
        : variant !== 'modal'
        ? "bg-white border shadow-sm"
        : ""
    )}>
      <CardHeader className={cn(
        "pb-3",
        variant === 'modal' && "border-b border-gray-200 px-6 pt-6"
      )}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-3 text-xl">
            <UserPlus className="h-6 w-6 text-brand-primary" />
            <span>Add New Recruit</span>
          </CardTitle>
          {variant === 'modal' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-8 w-8 p-0 hover:bg-gray-100 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className={cn(
        "flex-1 overflow-y-auto",
        variant === 'modal' ? "p-6 pt-4" : "pt-4"
      )}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Submit Error Alert */}
          {submitError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {/* Name Field */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-base">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Enter recruit's full name"
              className={cn(
                "h-12 text-base",
                errors.name && 'border-red-500 focus-visible:ring-red-500'
              )}
              disabled={loading}
              required
            />
            {errors.name && (
              <p className="text-sm text-red-600 flex items-center space-x-1">
                <AlertCircle className="h-3 w-3" />
                <span>{errors.name}</span>
              </p>
            )}
          </div>

          {/* Hometown Field */}
          <div className="space-y-2">
            <Label htmlFor="hometown" className="text-base">
              Hometown <span className="text-red-500">*</span>
            </Label>
            <Input
              id="hometown"
              type="text"
              value={formData.hometown}
              onChange={(e) => handleInputChange('hometown', e.target.value)}
              placeholder="Enter hometown"
              className={cn(
                "h-12 text-base",
                errors.hometown && 'border-red-500 focus-visible:ring-red-500'
              )}
              disabled={loading}
              required
            />
            {errors.hometown && (
              <p className="text-sm text-red-600 flex items-center space-x-1">
                <AlertCircle className="h-3 w-3" />
                <span>{errors.hometown}</span>
              </p>
            )}
          </div>

          {/* Phone Number and Instagram Handle - Side by side on desktop */}
          <div className={cn(
            "gap-4",
            isMobile ? "space-y-4" : "space-y-4 sm:space-y-0 sm:grid sm:grid-cols-2"
          )}>
            {/* Phone Number Field */}
            <div className="space-y-2">
              <Label htmlFor="phone_number" className="text-base">Phone Number *</Label>
              <Input
                id="phone_number"
                type="tel"
                value={formData.phone_number}
                onChange={(e) => handleInputChange('phone_number', e.target.value)}
                placeholder="(555) 123-4567"
                className={cn(
                  "h-12 text-base",
                  errors.phone_number && 'border-red-500 focus-visible:ring-red-500'
                )}
                disabled={loading}
              />
              {errors.phone_number && (
                <p className="text-sm text-red-600 flex items-center space-x-1">
                  <AlertCircle className="h-3 w-3" />
                  <span>{errors.phone_number}</span>
                </p>
              )}
              {formData.phone_number && !isValidPhoneNumber(formData.phone_number) && !errors.phone_number && (
                <p className="text-xs text-amber-600">
                  Please enter a complete 10-digit phone number
                </p>
              )}
            </div>

            {/* Instagram Handle Field */}
            <div className="space-y-2">
              <Label htmlFor="instagram_handle" className="text-base">Instagram Handle (Optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                <Input
                  id="instagram_handle"
                  type="text"
                  value={formData.instagram_handle}
                  onChange={(e) => handleInputChange('instagram_handle', e.target.value)}
                  placeholder="username"
                  className={cn(
                    "h-12 text-base pl-7",
                    errors.instagram_handle && 'border-red-500 focus-visible:ring-red-500'
                  )}
                  disabled={loading}
                />
              </div>
              {errors.instagram_handle && (
                <p className="text-sm text-red-600 flex items-center space-x-1">
                  <AlertCircle className="h-3 w-3" />
                  <span>{errors.instagram_handle}</span>
                </p>
              )}
              <p className="text-xs text-gray-500">
                The @ symbol will be added automatically
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          {variant === 'modal' && isMobile ? (
            <div className="flex-shrink-0 border-t border-gray-200 bg-white p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
              <div className="flex flex-row space-x-2"> {/* Change from flex-col space-y-2 to flex-row space-x-2 */}
                {onCancel && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    disabled={loading}
                    className="flex-1 rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Submitting...</span>
                    </div>
                  ) : (
                    'Submit Recruit'
                  )}
                </Button>
              </div>
            </div>
          ) : (
            /* Desktop/Inline Footer */
            <div className={cn(
              "flex-shrink-0",
              variant === 'modal' && "border-t border-gray-200 p-6"
            )}>
              <div className={cn(
                "flex space-x-2",
                variant === 'modal' ? "justify-end" : "pt-4"
              )}>
                {onCancel && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    className="flex-1 h-10 rounded-full border-gray-300 shadow-md shadow-gray-300 hover:bg-gray-50"
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  className={cn(
                    onCancel ? "flex-1" : "w-full",
                    "h-10 rounded-full bg-brand-primary hover:bg-brand-primary-hover shadow-lg shadow-navy-200"
                  )}
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Submitting...</span>
                    </div>
                  ) : (
                    'Submit Recruit'
                  )}
                </Button>
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
