'use client';
import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, AlertCircle, Users, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Invitation, JoinFormData } from '@/types/invitations';
import { toast } from 'react-toastify';
import { supabase } from '@/lib/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { getSafeRedirect } from '@/lib/utils/safeRedirect';

interface JoinFormProps {
  invitation: Invitation;
  onSuccess: (userData: any) => void;
  onCancel: () => void;
}

export function JoinForm({ invitation, onSuccess, onCancel }: JoinFormProps) {
  const [formData, setFormData] = useState<JoinFormData>({
    email: '',
    password: '',
    full_name: '',
    first_name: '',
    last_name: '',
    phone: '',
    sms_consent: false,
    graduation_year: new Date().getFullYear() + 4, // Default - will be updated in onboarding
    major: '',
    location: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** When set, show Sign in CTA for EXISTING_ACCOUNT (TRA-661). */
  const [existingAccountSignInHref, setExistingAccountSignInHref] = useState<string | null>(null);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.first_name?.trim()) {
      newErrors.first_name = 'First name is required';
    }

    if (!formData.last_name?.trim()) {
      newErrors.last_name = 'Last name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    // Phone required; must be 10 digits
    if (!formData.phone?.trim()) {
      newErrors.phone = 'Phone number is required';
    } else {
      const digits = formData.phone.replace(/\D/g, '');
      if (digits.length !== 10) {
        newErrors.phone = 'Please enter a complete 10-digit phone number';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const formatPhoneNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // Prepare simplified data - only send what's needed for account creation
      // Other fields will be collected during onboarding
      const submitData = {
        ...formData,
        full_name: `${formData.first_name || ''} ${formData.last_name || ''}`.trim(),
        // Set defaults for required fields - will be updated in onboarding
        major: 'To be updated',
        graduation_year: new Date().getFullYear() + 4,
      };

      const response = await fetch(`/api/invitations/accept/${invitation.token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submitData)
      });

      const data = await response.json().catch(() => ({} as { error?: string; code?: string }));

      if (!response.ok) {
        if (response.status === 409 && data.code === 'EXISTING_ACCOUNT') {
          const returnPath = `/join/${invitation.token}`;
          const safe = getSafeRedirect(returnPath);
          setExistingAccountSignInHref(
            safe ? `/sign-in?redirect=${encodeURIComponent(safe)}` : '/sign-in'
          );
          setErrors({
            email:
              'This email already has an account. Sign in, then use “Accept invitation” on the invite page.',
          });
          return;
        }
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to create account');
      }

      // CRITICAL: Ensure client-side session is established
      try {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email.toLowerCase(),
          password: formData.password
        });

        if (signInError) {
          console.error('Client-side sign-in failed:', signInError);
        }
      } catch (signInError) {
        console.error('Client-side sign-in error:', signInError);
      }

      toast.success('Account created! Let\'s complete your profile.');
      onSuccess(data.user);
    } catch (error) {
      console.error('Error creating account:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create account';
      toast.error(errorMessage);
      setExistingAccountSignInHref(null);

      if (errorMessage.includes('already been used')) {
        setErrors({ email: 'This email has already been used with this invitation' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof JoinFormData, value: string | boolean | number) => {
    const nextValue = field === 'phone' ? formatPhoneNumber(String(value)) : value;
    setFormData(prev => ({ ...prev, [field]: nextValue }));

    if (field === 'email') {
      setExistingAccountSignInHref(null);
    }

    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-accent-50 flex items-center justify-center p-2 md:p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <Card>
          <CardHeader className="pb-2 md:pb-4">
            <div className="flex items-center space-x-2 md:space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="p-1"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-lg md:text-xl">Create Your Account</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 md:pt-1">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name Fields - Side by Side */}
              <div className="grid grid-cols-2 gap-3">
                {/* First Name */}
                <div className="space-y-1">
                  <Label htmlFor="first_name" className="text-sm">First Name *</Label>
                  <Input
                    id="first_name"
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => handleInputChange('first_name', e.target.value)}
                    placeholder="First name"
                    className={`h-9 ${errors.first_name ? 'border-red-500' : ''}`}
                  />
                  {errors.first_name && (
                    <p className="text-xs text-red-600 flex items-center space-x-1">
                      <AlertCircle className="h-3 w-3" />
                      <span>{errors.first_name}</span>
                    </p>
                  )}
                </div>

                {/* Last Name */}
                <div className="space-y-1">
                  <Label htmlFor="last_name" className="text-sm">Last Name *</Label>
                  <Input
                    id="last_name"
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => handleInputChange('last_name', e.target.value)}
                    placeholder="Last name"
                    className={`h-9 ${errors.last_name ? 'border-red-500' : ''}`}
                  />
                  {errors.last_name && (
                    <p className="text-xs text-red-600 flex items-center space-x-1">
                      <AlertCircle className="h-3 w-3" />
                      <span>{errors.last_name}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <Label htmlFor="email" className="text-sm">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter your email address"
                  className={`h-9 ${errors.email ? 'border-red-500' : ''}`}
                />
                {errors.email && (
                  <p className="text-xs text-red-600 flex items-center space-x-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.email}</span>
                  </p>
                )}
                {existingAccountSignInHref && (
                  <p className="text-xs mt-2">
                    <Link
                      href={existingAccountSignInHref}
                      className="font-medium text-brand-primary hover:underline"
                    >
                      Sign in to continue
                    </Link>
                  </p>
                )}
              </div>

              {/* Phone (required) */}
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-sm">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className={`h-9 ${errors.phone ? 'border-red-500' : ''}`}
                  maxLength={14}
                  inputMode="numeric"
                />
                <p className="text-xs text-gray-500"> Get timely chapter updates and invites by text.</p>
                {errors.phone && (
                  <p className="text-xs text-red-600 flex items-center space-x-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.phone}</span>
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1">
                <Label htmlFor="password" className="text-sm">Password *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder="Create a password"
                    className={`h-9 pr-10 ${errors.password ? 'border-red-500' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-600 flex items-center space-x-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.password}</span>
                  </p>
                )}
                <p className="text-xs text-gray-500">Minimum 6 characters</p>
              </div>

              {/* SMS Consent Checkbox */}
              <div className="space-y-1">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="sms-consent"
                    checked={formData.sms_consent || false}
                    onCheckedChange={(checked) => handleInputChange('sms_consent', checked === true)}
                    className="mt-0.5"
                    disabled={loading}
                  />
                  <Label
                    htmlFor="sms-consent"
                    className="text-xs leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Sign me up for SMS from your chapter.
                  </Label>
                </div>
              </div>

              {/* Chapter Info */}
              <div className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4 text-brand-primary" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Joining {invitation.chapter_name}</p>
                    <p className="text-xs text-gray-500">as an Active Member</p>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="rounded-full w-full bg-brand-accent hover:bg-brand-accent-hover h-10"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating Account...</span>
                  </div>
                ) : (
                  'Create Account & Continue'
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Back to invitation details
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
