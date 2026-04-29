'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { X, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DeveloperReferenceSearchField,
  type DeveloperReferenceSelection,
} from './DeveloperReferenceSearchField';
import { DeveloperUserSearchPickField, type DeveloperUserPick } from './DeveloperUserSearchPickField';
import { FieldHint } from './FieldHint';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  SPACE_TYPE_SEARCHABLE_OPTIONS,
  normalizeSpaceTypeInput,
} from '@/lib/spaceTypeTaxonomy';
import { fileToImageDataUrl } from '@/lib/utils/readImageFileAsDataUrl';

interface CreateChapterFormProps {
  accessToken: string | undefined;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateChapterForm({ accessToken, onClose, onSuccess }: CreateChapterFormProps) {
  const [mounted, setMounted] = useState(false);
  const portalHostRef = useRef<HTMLDivElement>(null);

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
    space_type: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [schoolLink, setSchoolLink] = useState<DeveloperReferenceSelection | null>(null);
  const [orgLink, setOrgLink] = useState<DeveloperReferenceSelection | null>(null);
  const [spaceIconUser, setSpaceIconUser] = useState<DeveloperUserPick | null>(null);
  /** Optional data URL → POST as space_image_data_url for chapter primary logo. */
  const [spaceImageDataUrl, setSpaceImageDataUrl] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Space name is required';
    if (!formData.university.trim()) newErrors.university = 'University is required';
    if (!formData.national_fraternity.trim()) {
      newErrors.national_fraternity = 'National organization is required';
    }
    if (!formData.chapter_name.trim()) newErrors.chapter_name = 'Short chapter name is required';
    if (!formData.location.trim()) newErrors.location = 'Location is required';
    if (!formData.founded_year.trim()) newErrors.founded_year = 'Founded year is required';
    if (!formData.member_count.trim()) newErrors.member_count = 'Member count is required';

    const year = parseInt(formData.founded_year, 10);
    if (isNaN(year) || year < 1800 || year > new Date().getFullYear()) {
      newErrors.founded_year = 'Please enter a valid year between 1800 and current year';
    }

    const memberCount = parseInt(formData.member_count, 10);
    if (isNaN(memberCount) || memberCount < 0) {
      newErrors.member_count = 'Please enter a valid member count';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const generateSlug = () => {
    const baseSlug = `${formData.national_fraternity.toLowerCase().replace(/\s+/g, '-')}-${formData.chapter_name.toLowerCase().replace(/\s+/g, '-')}-${formData.school.toLowerCase().replace(/\s+/g, '-')}`;
    return baseSlug.replace(/[^a-z0-9-]/g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setLoading(true);

      const chapterData = {
        ...formData,
        member_count: parseInt(formData.member_count, 10),
        founded_year: parseInt(formData.founded_year, 10),
        slug: generateSlug(),
        llm_enriched: false,
        llm_data: null,
        events: null,
        achievements: null,
        space_type: normalizeSpaceTypeInput(formData.space_type),
        school_id: schoolLink?.kind === 'school' ? schoolLink.id : null,
        national_organization_id:
          orgLink?.kind === 'national_organization' ? orgLink.id : null,
        ...(spaceIconUser ? { space_icon_user_id: spaceIconUser.id } : {}),
        ...(spaceImageDataUrl ? { space_image_data_url: spaceImageDataUrl } : {}),
      };

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const response = await fetch('/api/developer/chapters', {
        method: 'POST',
        headers,
        body: JSON.stringify(chapterData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create space');
      }

      onSuccess();
      onClose();
      alert('Space created successfully!');
    } catch (error) {
      console.error('Error creating space:', error);
      alert(`Failed to create space: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  const hasSchoolDirectoryLink = schoolLink?.kind === 'school';
  const hasOrgDirectoryLink = orgLink?.kind === 'national_organization';
  const showManualOrgField = !hasOrgDirectoryLink;
  const showManualUniversityField = !hasSchoolDirectoryLink;
  const showDirectoryBackedFieldsRow = showManualOrgField || showManualUniversityField;

  return createPortal(
    <div
      ref={portalHostRef}
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
              <span>Create new space</span>
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
            Add a space (organization) to the directory. Link a school and national organization when possible.
          </p>
        </CardHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="space-y-6">
              <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-4">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-800">Directory links (recommended)</p>
                  <FieldHint text="Links this space to canonical school and national organization rows so foreign keys and synced names stay accurate." />
                </div>
                <p className="text-xs text-gray-600">
                  Link this space to seeded <strong>schools</strong> and <strong>national organizations</strong> so
                  <code className="mx-1 text-[11px]">school_id</code> and
                  <code className="mx-1 text-[11px]">national_organization_id</code> are stored. Fields below update
                  from your selection (you can still edit location and other details).
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

              <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4">
                <DeveloperUserSearchPickField
                  label="Space Icon (optional)"
                  labelHint="Search a profile by name, email, or UUID. On save, that user becomes an active member of the new space and the exclusive Space Icon."
                  accessToken={accessToken}
                  value={spaceIconUser}
                  onChange={setSpaceIconUser}
                />
              </div>

              <div className="rounded-lg border border-dashed border-gray-300 bg-white/80 p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm font-medium text-gray-900">Space image (optional)</Label>
                  <FieldHint text="Stored as the space's primary chapter logo (JPEG, PNG, or GIF, max 5 MB)." />
                </div>
                <p className="text-xs text-gray-600">
                  Upload a logo or photo for this space. It appears in branding after the space is created.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif"
                    className="max-w-xs cursor-pointer text-sm file:mr-2"
                    disabled={loading}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const r = await fileToImageDataUrl(f);
                      if (!r.ok) {
                        alert(r.error);
                        return;
                      }
                      setSpaceImageDataUrl(r.dataUrl);
                    }}
                  />
                  {spaceImageDataUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={spaceImageDataUrl}
                        alt=""
                        className="h-16 w-16 rounded-md border object-cover"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSpaceImageDataUrl(null)}
                        disabled={loading}
                      >
                        Remove image
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="space_type">Organization type</Label>
                  <FieldHint text="Canonical category (stored as a stable slug on the space). Pick a preset or type your own if it is not listed." />
                </div>
                <SearchableSelect
                  value={formData.space_type}
                  onValueChange={(v) => handleInputChange('space_type', v)}
                  options={SPACE_TYPE_SEARCHABLE_OPTIONS}
                  placeholder="Select or type organization type…"
                  searchPlaceholder="Search types…"
                  allowCustom
                  customMaxLength={200}
                  className="mt-0"
                  portalContainerRef={portalHostRef}
                />
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
                    <Label htmlFor="chapter_name">Chapter Name (Short) *</Label>
                    <FieldHint text="Short label for this chapter or branch (for example Greek letters like Omega). Shown next to the full name and used in the URL slug." />
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
                        <Label htmlFor="national_fraternity">National organization *</Label>
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

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="school">School (Short Name)</Label>
                    <FieldHint text="Short campus or school nickname (for example Ole Miss). Used in search, labels, and the generated slug." />
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

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="school_location">School location</Label>
                  <FieldHint text="City and state (or similar) for the institution campus, often prefilled when you link a school from the directory." />
                </div>
                <Input
                  id="school_location"
                  value={formData.school_location}
                  onChange={(e) => handleInputChange('school_location', e.target.value)}
                  placeholder="e.g., Oxford, MS"
                />
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="founded_year">Founded year *</Label>
                    <FieldHint text="Year this branch or space was founded, shown on profiles and detail views." />
                  </div>
                  <Input
                    id="founded_year"
                    type="number"
                    value={formData.founded_year}
                    onChange={(e) => handleInputChange('founded_year', e.target.value)}
                    placeholder="e.g., 1855"
                    min={1800}
                    max={new Date().getFullYear()}
                    className={errors.founded_year ? 'border-red-500' : ''}
                  />
                  {errors.founded_year && <p className="text-sm text-red-500">{errors.founded_year}</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="member_count">Member count *</Label>
                    <FieldHint text="Approximate number of active members displayed on the space for admins and directory-style views." />
                  </div>
                  <Input
                    id="member_count"
                    type="number"
                    value={formData.member_count}
                    onChange={(e) => handleInputChange('member_count', e.target.value)}
                    placeholder="e.g., 10"
                    min={0}
                    className={errors.member_count ? 'border-red-500' : ''}
                  />
                  {errors.member_count && <p className="text-sm text-red-500">{errors.member_count}</p>}
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50/70 px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900" id="create_chapter_status_label">
                      Space status
                    </span>
                    <FieldHint text="On = Active (live). Off = Inactive (directory shell; use for seeded spaces until you launch them)." />
                  </div>
                  <p className="text-xs text-gray-600">
                    {formData.chapter_status === 'active' ? (
                      <>New space will be <strong>active</strong> when created.</>
                    ) : (
                      <>New space will be <strong>inactive</strong> (hidden from active-only lists).</>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 sm:pt-0.5">
                  <span className="text-[10px] text-gray-500">Live</span>
                  <Switch
                    checked={formData.chapter_status === 'active'}
                    onCheckedChange={(checked) =>
                      handleInputChange('chapter_status', checked ? 'active' : 'inactive')
                    }
                    className="shrink-0"
                    aria-labelledby="create_chapter_status_label"
                    aria-label={formData.chapter_status === 'active' ? 'Create as active space' : 'Create as inactive space'}
                  />
                </div>
              </div>

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
                  <Label>Generated slug</Label>
                  <FieldHint text="URL-safe identifier derived from national organization, local designation, and school text when you save this space." />
                </div>
                <Input
                  value={generateSlug()}
                  readOnly
                  className="bg-gray-50 text-gray-600"
                  placeholder="Slug is generated automatically"
                />
                <p className="text-xs text-gray-500">
                  Generated from national organization, local designation, and school when you save.
                </p>
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
                    <span>Creating…</span>
                  </>
                ) : (
                  <>
                    <Building2 className="h-4 w-4" />
                    <span>Create space</span>
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
