'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, AlertCircle, Users, Loader2, GraduationCap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'react-toastify';
import { supabase } from '@/lib/supabase/client';

interface ChapterInfo {
  id: string;
  name: string;
  chapter_name: string;
  slug: string;
}

interface ChapterJoinFormProps {
  chapter: ChapterInfo;
  joinRole: 'active_member' | 'alumni';
  onSuccess: (userData: { needs_approval?: boolean }) => void;
  onCancel: () => void;
}

interface FormData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
  sms_consent: boolean;
}

export function ChapterJoinForm({ chapter, joinRole, onSuccess, onCancel }: ChapterJoinFormProps) {
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    sms_consent: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isAlumni = joinRole === 'alumni';

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }
    if (!formData.last_name.trim()) {
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
    if (!formData.phone.trim()) {
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
    if (!validateForm()) return;

    setLoading(true);

    try {
      const submitData = {
        email: formData.email,
        password: formData.password,
        first_name: formData.first_name,
        last_name: formData.last_name,
        full_name: `${formData.first_name} ${formData.last_name}`.trim(),
        phone: formData.phone,
        sms_consent: formData.sms_consent,
        join_role: joinRole,
        graduation_year: isAlumni ? new Date().getFullYear() : new Date().getFullYear() + 4,
        major: isAlumni ? undefined : 'To be updated',
        industry: isAlumni ? 'Not specified' : undefined,
        company: isAlumni ? 'Not specified' : undefined,
        job_title: isAlumni ? 'Not specified' : undefined,
        location: 'Not specified',
      };

      const response = await fetch(`/api/chapter-join/${chapter.slug}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create account');
      }

      const data = await response.json();

      try {
        await supabase.auth.signInWithPassword({
          email: formData.email.toLowerCase(),
          password: formData.password,
        });
      } catch (signInError) {
        console.error('Client-side sign-in error:', signInError);
      }

      toast.success("Account created! Let's complete your profile.");
      onSuccess(data.user);
    } catch (err) {
      console.error('Error creating account:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create account';
      toast.error(errorMessage);

      if (errorMessage.includes('already')) {
        setErrors({ email: errorMessage });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    const nextValue = field === 'phone' ? formatPhoneNumber(String(value)) : value;
    setFormData(prev => ({ ...prev, [field]: nextValue }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-50 to-purple-50 flex items-center justify-center p-2 md:p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <Card>
          <CardHeader className="pb-2 md:pb-4">
            <div className="flex items-center space-x-2 md:space-x-3">
              <Button variant="ghost" size="sm" onClick={onCancel} className="p-1">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-lg md:text-xl">Create Your Account</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 md:pt-1">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
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
              </div>

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
                <p className="text-xs text-gray-500">Used for SMS notifications about chapter updates and events</p>
                {errors.phone && (
                  <p className="text-xs text-red-600 flex items-center space-x-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.phone}</span>
                  </p>
                )}
              </div>

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

              <div className="space-y-1">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="sms-consent"
                    checked={formData.sms_consent}
                    onCheckedChange={(checked) => handleInputChange('sms_consent', checked === true)}
                    className="mt-0.5"
                    disabled={loading}
                  />
                  <Label
                    htmlFor="sms-consent"
                    className="text-xs leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
I agree to receive SMS notifications from {['Trail', 'blaize'].join('')}, Inc. Message and data rates may apply. Reply STOP to opt out.
                  </Label>
                </div>
              </div>

              <div className={`rounded-lg p-3 ${isAlumni ? 'bg-purple-50 border border-purple-200' : 'bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20'}`}>
                <div className="flex items-center space-x-2">
                  {isAlumni ? (
                    <GraduationCap className="h-4 w-4 text-purple-600" />
                  ) : (
                    <Users className="h-4 w-4 text-brand-primary" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">Joining {chapter.name}</p>
                    <p className="text-xs text-gray-500">
                      as {isAlumni ? 'an Alumni Member' : 'an Active Member'}
                    </p>
                  </div>
                </div>
              </div>

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
                  Back to sign-up options
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
