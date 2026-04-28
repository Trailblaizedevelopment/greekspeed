'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DeveloperReferenceSearchField,
  type DeveloperReferenceSelection,
} from './DeveloperReferenceSearchField';
import { FieldHint } from './FieldHint';

interface Chapter {
  id: string;
  name: string;
  description: string;
  location: string;
  member_count: number;
  founded_year: number;
  university: string;
  slug: string;
  national_fraternity: string;
  chapter_name: string;
  school: string;
  school_location: string;
  chapter_status: string;
  created_at: string;
  updated_at: string;
  school_id?: string | null;
  national_organization_id?: string | null;
}

interface EditChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapter: Chapter | null;
  accessToken: string | undefined;
  onSuccess: () => void;
}

export function EditChapterModal({ isOpen, onClose, chapter, accessToken, onSuccess }: EditChapterModalProps) {
  const [mounted, setMounted] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    member_count: '',
    founded_year: '',
    university: '',
    national_fraternity: '',
    chapter_name: '',
    school: '',
    school_location: '',
    chapter_status: 'active',
    slug: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [schoolLink, setSchoolLink] = useState<DeveloperReferenceSelection | null>(null);
  const [orgLink, setOrgLink] = useState<DeveloperReferenceSelection | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize form data when chapter changes
  useEffect(() => {
    if (chapter) {
      setFormData({
        name: chapter.name || '',
        description: chapter.description || '',
        location: chapter.location || '',
        member_count: chapter.member_count?.toString() || '',
        founded_year: chapter.founded_year?.toString() || '',
        university: chapter.university || '',
        national_fraternity: chapter.national_fraternity || '',
        chapter_name: chapter.chapter_name || '',
        school: chapter.school || '',
        school_location: chapter.school_location || '',
        chapter_status: chapter.chapter_status || 'active',
        slug: chapter.slug || '',
      });
      if (chapter.school_id) {
        setSchoolLink({
          kind: 'school',
          id: chapter.school_id,
          label: chapter.school
            ? `${chapter.university} (${chapter.school})`
            : chapter.university,
          row: {
            id: chapter.school_id,
            name: chapter.university,
            short_name: chapter.school || null,
            location: chapter.school_location || null,
          },
        });
      } else {
        setSchoolLink(null);
      }
      if (chapter.national_organization_id) {
        setOrgLink({
          kind: 'national_organization',
          id: chapter.national_organization_id,
          label: chapter.national_fraternity,
          row: {
            id: chapter.national_organization_id,
            name: chapter.national_fraternity,
            short_name: null,
            type: null,
          },
        });
      } else {
        setOrgLink(null);
      }
      setErrors({});
    }
  }, [chapter]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Full space name is required';
    if (!formData.university.trim()) newErrors.university = 'University is required';
    if (!formData.national_fraternity.trim()) newErrors.national_fraternity = 'National organization is required';
    if (!formData.chapter_name.trim()) newErrors.chapter_name = 'Local designation is required';
    if (!formData.location.trim()) newErrors.location = 'Location is required';
    if (!formData.founded_year.trim()) newErrors.founded_year = 'Founded year is required';
    if (!formData.member_count.trim()) newErrors.member_count = 'Member count is required';

    // Validate founded year
    const year = parseInt(formData.founded_year);
    if (isNaN(year) || year < 1800 || year > new Date().getFullYear()) {
      newErrors.founded_year = 'Please enter a valid year between 1800 and current year';
    }

    // Validate member count
    const memberCount = parseInt(formData.member_count);
    if (isNaN(memberCount) || memberCount < 0) {
      newErrors.member_count = 'Please enter a valid member count';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!chapter || !validateForm()) return;

    try {
      setLoading(true);

      const chapterData = {
        ...formData,
        member_count: parseInt(formData.member_count, 10),
        founded_year: parseInt(formData.founded_year, 10),
        school_id: schoolLink?.kind === 'school' ? schoolLink.id : null,
        national_organization_id:
          orgLink?.kind === 'national_organization' ? orgLink.id : null,
      };

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const response = await fetch(`/api/developer/chapters?chapterId=${chapter.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(chapterData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update space');
      }

      onSuccess();
      onClose();
      alert('Space updated successfully!');
      
    } catch (error) {
      console.error('Error updating chapter:', error);
      alert(`Failed to update space: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted || !isOpen || !chapter) return null;

  const hasSchoolDirectoryLink = schoolLink?.kind === 'school';
  const hasOrgDirectoryLink = orgLink?.kind === 'national_organization';
  const showManualOrgField = !hasOrgDirectoryLink;
  const showManualUniversityField = !hasSchoolDirectoryLink;
  const showDirectoryBackedFieldsRow = showManualOrgField || showManualUniversityField;

  return createPortal(
    <div
      className="fixed inset-0 z-[100150] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card
        className="relative z-[100160] flex h-full max-h-[min(90vh,820px)] w-full max-w-4xl flex-col overflow-hidden shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="shrink-0 border-b border-gray-200 pb-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Building2 className="h-5 w-5 shrink-0 text-brand-accent" />
              <span>Edit space: {chapter.name}</span>
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 shrink-0 p-0 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Update directory links and fields on this space. Only the middle section scrolls.
          </p>
        </CardHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-gray-800">Directory links</p>
                <FieldHint text="Links this space to canonical school and national organization rows so foreign keys and synced names stay accurate." />
              </div>
              <p className="text-xs text-gray-600">
                Link or update <code className="text-[11px]">school_id</code> and{' '}
                <code className="text-[11px]">national_organization_id</code> to match seeded directory rows.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DeveloperReferenceSearchField
                  label="School (directory)"
                  labelHint="Choose the institution from the schools table so this space stores school_id and fills university, nickname, and campus text from that record."
                  kind="schools"
                  accessToken={accessToken}
                  value={schoolLink?.kind === 'school' ? schoolLink : null}
                  onChange={(next) => {
                    setSchoolLink(next?.kind === 'school' ? next : null);
                    if (next?.kind === 'school') {
                      const r = next.row;
                      setFormData((prev) => ({
                        ...prev,
                        university: r.name,
                        school: (r.short_name ?? '').trim() || prev.school,
                        school_location: (r.location ?? '').trim() || prev.school_location,
                      }));
                    }
                  }}
                />
                <DeveloperReferenceSearchField
                  label="National organization (directory)"
                  labelHint="Choose the umbrella organization from the directory so this space stores national_organization_id and uses its official name on the space."
                  kind="national-organizations"
                  accessToken={accessToken}
                  value={orgLink?.kind === 'national_organization' ? orgLink : null}
                  onChange={(next) => {
                    setOrgLink(next?.kind === 'national_organization' ? next : null);
                    if (next?.kind === 'national_organization') {
                      setFormData((prev) => ({
                        ...prev,
                        national_fraternity: next.row.name,
                      }));
                    }
                  }}
                />
              </div>
            </div>

            {/* Same form fields as CreateChapterForm */}
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="name">Full space name *</Label>
                  <FieldHint text="The main title shown for this space in lists, search, and headers across the product." />
                </div>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="e.g., Sigma Chi Eta (Ole Miss)"
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="chapter_name">Local designation *</Label>
                  <FieldHint text="Short branch label for this space (for example a Greek letter chapter) stored as the local designation alongside the full name." />
                </div>
                <Input
                  id="chapter_name"
                  value={formData.chapter_name}
                  onChange={(e) => handleInputChange('chapter_name', e.target.value)}
                  placeholder="e.g., Eta"
                  className={errors.chapter_name ? 'border-red-500' : ''}
                />
                {errors.chapter_name && <p className="text-sm text-red-500">{errors.chapter_name}</p>}
              </div>
            </div>

            {/* National organization & university — manual entry only when not set via directory */}
            {showDirectoryBackedFieldsRow ? (
              <div
                className={cn(
                  'grid gap-6',
                  showManualOrgField && showManualUniversityField && 'md:grid-cols-2'
                )}
              >
                {showManualOrgField ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="national_fraternity">National Fraternity *</Label>
                      <FieldHint text="Official umbrella organization name when you are not picking a row from the national organization directory." />
                    </div>
                    <Input
                      id="national_fraternity"
                      value={formData.national_fraternity}
                      onChange={(e) => handleInputChange('national_fraternity', e.target.value)}
                      placeholder="e.g., Sigma Chi"
                      className={errors.national_fraternity ? 'border-red-500' : ''}
                    />
                    {errors.national_fraternity && (
                      <p className="text-sm text-red-500">{errors.national_fraternity}</p>
                    )}
                  </div>
                ) : null}

                {showManualUniversityField ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="university">University *</Label>
                      <FieldHint text="Full formal school or campus name when you are not linking a school from the directory above." />
                    </div>
                    <Input
                      id="university"
                      value={formData.university}
                      onChange={(e) => handleInputChange('university', e.target.value)}
                      placeholder="e.g., University of Mississippi"
                      className={errors.university ? 'border-red-500' : ''}
                    />
                    {errors.university && <p className="text-sm text-red-500">{errors.university}</p>}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* School & Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="school">School</Label>
                  <FieldHint text="Informal or short school nickname stored on the space for search, labels, and URLs (for example a well-known campus shorthand)." />
                </div>
                <Input
                  id="school"
                  value={formData.school}
                  onChange={(e) => handleInputChange('school', e.target.value)}
                  placeholder="e.g., Ole Miss"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="location">Location *</Label>
                  <FieldHint text="Where this space primarily operates or meets, written as a city, region, or address string users will recognize." />
                </div>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  placeholder="e.g., Oxford, Mississippi"
                  className={errors.location ? 'border-red-500' : ''}
                />
                {errors.location && <p className="text-sm text-red-500">{errors.location}</p>}
              </div>
            </div>

            {/* School Location */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="school_location">School Location</Label>
                <FieldHint text="City and state (or similar) for the institution campus, often prefilled when you link a school from the directory." />
              </div>
              <Input
                id="school_location"
                value={formData.school_location}
                onChange={(e) => handleInputChange('school_location', e.target.value)}
                placeholder="e.g., Oxford, MS"
              />
            </div>

            {/* Founded Year & Member Count */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="founded_year">Founded Year *</Label>
                  <FieldHint text="Year this branch or space was founded, shown on profiles and detail views." />
                </div>
                <Input
                  id="founded_year"
                  type="number"
                  value={formData.founded_year}
                  onChange={(e) => handleInputChange('founded_year', e.target.value)}
                  placeholder="e.g., 1855"
                  min="1800"
                  max={new Date().getFullYear()}
                  className={errors.founded_year ? 'border-red-500' : ''}
                />
                {errors.founded_year && <p className="text-sm text-red-500">{errors.founded_year}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="member_count">Member Count *</Label>
                  <FieldHint text="Approximate number of active members displayed on the space for admins and directory-style views." />
                </div>
                <Input
                  id="member_count"
                  type="number"
                  value={formData.member_count}
                  onChange={(e) => handleInputChange('member_count', e.target.value)}
                  placeholder="e.g., 10"
                  min="0"
                  className={errors.member_count ? 'border-red-500' : ''}
                />
                {errors.member_count && <p className="text-sm text-red-500">{errors.member_count}</p>}
              </div>
            </div>

            {/* Chapter Status */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="chapter_status">Space status</Label>
                <FieldHint text="Controls whether the space is treated as active, inactive, suspended, or on probation in admin and member flows." />
              </div>
              <Select
                value={formData.chapter_status}
                onValueChange={(value) => handleInputChange('chapter_status', value)}
              >
                <SelectTrigger id="chapter_status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="probation">Probation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="description">Description</Label>
                <FieldHint text="Optional longer copy describing the space where the product shows a narrative or marketing-style blurb." />
              </div>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe this space…"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Slug</Label>
                <FieldHint text="Stable URL-safe identifier for this space used in links and joins; change only with care because it can break bookmarks." />
              </div>
              <Input value={formData.slug} readOnly className="bg-gray-50 text-gray-600" />
            </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-gray-50/90 px-6 py-4">
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="flex items-center gap-2 rounded-full">
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                    <span>Updating…</span>
                  </>
                ) : (
                  <>
                    <Building2 className="h-4 w-4" />
                    <span>Update space</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>,
    document.body
  );
}