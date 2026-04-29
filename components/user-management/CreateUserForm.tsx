'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectItem } from '@/components/ui/select';
import { X, Plus, Trash2, User } from 'lucide-react';
import { useChapters } from '@/lib/hooks/useChapters';
import { useAuth } from '@/lib/supabase/auth-context';
import { useVisualViewportHeight } from '@/lib/hooks/useVisualViewportHeight';
import { cn } from '@/lib/utils';
import { DeveloperSpaceSelectCombobox } from '@/components/user-management/DeveloperSpaceSelectCombobox';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  normalizeSpaceTypeInput,
  SPACE_TYPE_SEARCHABLE_OPTIONS,
} from '@/lib/spaceTypeTaxonomy';
import { ImageCropper } from '@/components/features/common/ImageCropper';
import { Textarea } from '@/components/ui/textarea';
import { BIO_MAX_LENGTH } from '@/lib/constants/profileConstants';
import type { CanonicalPlaceConfirmed } from '@/types/canonicalPlace';
import { LocationPicker } from '@/components/features/location/LocationPicker';
import { formatUsPhoneInput, normalizeUsPhoneForStorage } from '@/lib/utils/formatUsPhone';

interface CreateUserFormProps {
  onClose: () => void;
  onSuccess: () => void;
  chapterContext?: {
    chapterId: string;
    chapterName: string;
    isChapterAdmin?: boolean;
  };
  /** Only developers can assign governance role; hide option for non-developers */
  isDeveloper?: boolean;
}

type ExtraIconRow =
  | { id: string; kind: 'existing'; spaceId: string; label: string }
  | { id: string; kind: 'new'; name: string; category: string };

export function CreateUserForm({ onClose, onSuccess, chapterContext, isDeveloper = false }: CreateUserFormProps) {
  const { getAuthHeaders } = useAuth();
  /** Portals SearchableSelect inside this modal so dropdown/search stay usable (z-index + focus). */
  const spaceTypeSelectPortalRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    chapter: chapterContext?.chapterId || '',
    role: 'active_member' as 'admin' | 'active_member' | 'alumni' | 'governance',
    chapter_role: 'member' as string,
    is_developer: false,
    governance_chapter_ids: [] as string[],
    /** Developer: set user as exclusive Space Icon for the selected space (requires space UUID). */
    setAsSpaceIcon: false,
    /** When Space Icon is on (developer): pick existing space vs create shell space. */
    spaceIconAttachMode: 'existing' as 'existing' | 'new',
    newSpaceName: '',
    newSpaceCategory: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdUser, setCreatedUser] = useState<any>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  /** Label for the selected space when using developer server search (CreateUserForm). */
  const [chapterPickLabel, setChapterPickLabel] = useState('');

  const useWizard = Boolean(isDeveloper && !chapterContext);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [extraIconRows, setExtraIconRows] = useState<ExtraIconRow[]>([]);
  const [currentPlace, setCurrentPlace] = useState<CanonicalPlaceConfirmed | null>(null);
  const wizardStepRef = useRef<1 | 2>(1);
  wizardStepRef.current = wizardStep;

  const showSpaceSection =
    !isDeveloper ||
    Boolean(chapterContext) ||
    (isDeveloper && !chapterContext && (!useWizard || wizardStep === 2));

  // Chapters for non-developer chapter picker and governance checkboxes
  const { chapters, loading: chaptersLoading } = useChapters();

  const { height: visualHeight, offsetTop } = useVisualViewportHeight();
  const [innerHeight, setInnerHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 768
  );

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setInnerHeight(window.innerHeight);
  }, []);

  const keyboardOpen = isMobile && visualHeight < innerHeight;
  const maxHeightPx = keyboardOpen ? visualHeight - 40 : undefined;
  const bottomPx = keyboardOpen
    ? innerHeight - (offsetTop + visualHeight)
    : undefined;

  // Auto-populate chapter if provided
  useEffect(() => {
    if (chapterContext && chapterContext.isChapterAdmin) {
      setFormData((prev) => ({ ...prev, chapter: chapterContext.chapterId }));
      setChapterPickLabel(chapterContext.chapterName);
    }
  }, [chapterContext]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (useWizard && wizardStepRef.current === 1) {
      return;
    }
    await submitCreateUser();
  };

  const goToSpaceStep = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!formData.email?.trim() || !formData.firstName?.trim() || !formData.lastName?.trim()) {
      alert('Email, first name, and last name are required.');
      return;
    }
    setWizardStep(2);
  };

  const submitCreateUser = async () => {
    if (useWizard && wizardStepRef.current === 1) {
      return;
    }

    setLoading(true);

    try {
      if (!formData.email || !formData.firstName || !formData.lastName) {
        throw new Error('Email, firstName, and lastName are required');
      }

      if (!isDeveloper || chapterContext) {
        if (!formData.chapter?.trim()) {
          throw new Error('Chapter is required');
        }
      } else if (formData.role === 'governance' && !formData.chapter?.trim()) {
        throw new Error('Chapter is required for governance users');
      } else if (formData.setAsSpaceIcon) {
        if (formData.spaceIconAttachMode === 'existing' && !formData.chapter?.trim()) {
          throw new Error('Select an existing space for Space Icon, or choose “Create new space”');
        }
        if (formData.spaceIconAttachMode === 'new' && !formData.newSpaceName.trim()) {
          throw new Error('Enter a display name for the new space');
        }
      }

      for (const row of extraIconRows) {
        if (row.kind === 'existing' && !row.spaceId.trim()) {
          throw new Error('Each additional Space Icon row must have a selected space, or remove the row.');
        }
        if (row.kind === 'new' && !row.name.trim()) {
          throw new Error('Each “new space” icon row needs a display name, or remove the row.');
        }
      }

      const additional_icon_memberships = extraIconRows
        .map((row) => {
          if (row.kind === 'existing') {
            if (!row.spaceId.trim()) return null;
            return { space_id: row.spaceId.trim() };
          }
          const cat = normalizeSpaceTypeInput(row.category);
          return {
            new_space: {
              name: row.name.trim(),
              ...(cat ? { category: cat } : {}),
            },
          };
        })
        .filter(Boolean);

      const phoneStored = normalizeUsPhoneForStorage(phone);

      const body: Record<string, unknown> = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        chapter_role: formData.chapter_role,
        is_developer: formData.is_developer,
        bio: bio.trim() || undefined,
        ...(phoneStored ? { phone: phoneStored } : {}),
        ...(currentPlace ? { current_place: currentPlace } : {}),
        ...(avatarDataUrl ? { avatar_data_url: avatarDataUrl } : {}),
        ...(additional_icon_memberships.length > 0
          ? { additional_icon_memberships }
          : {}),
      };

      if (isDeveloper && formData.setAsSpaceIcon && formData.spaceIconAttachMode === 'new') {
        body.chapter = null;
        const categoryNorm = normalizeSpaceTypeInput(formData.newSpaceCategory);
        body.newSpace = {
          name: formData.newSpaceName.trim(),
          ...(categoryNorm ? { category: categoryNorm } : {}),
        };
      } else {
        body.chapter = formData.chapter?.trim() || null;
      }

      if (formData.role === 'governance' && formData.governance_chapter_ids.length > 0) {
        body.governance_chapter_ids = formData.governance_chapter_ids;
      }
      if (isDeveloper && formData.setAsSpaceIcon) {
        body.is_space_icon = true;
      }
      const response = await fetch('/api/developer/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create user');
      }

      const data = await response.json();

      setCreatedUser(data.user);
      setTempPassword(data.tempPassword);
      setSuccess(true);
      setWizardStep(1);
      setExtraIconRows([]);
      setBio('');
      setPhone('');
      setAvatarDataUrl(null);
      setAvatarPreview(null);
      setImageToCrop(null);
      setShowCropper(false);
      setCurrentPlace(null);
    } catch (error) {
      console.error('Error creating user:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to create user'}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (success) {
    const successContent = (
      <>
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="font-medium text-green-800 mb-2">User Details:</h3>
          <p><strong>Name:</strong> {createdUser.full_name}</p>
          <p><strong>Email:</strong> {createdUser.email}</p>
          <p>
            <strong>Chapter:</strong> {createdUser.chapter?.trim() ? createdUser.chapter : '— (none yet)'}
          </p>
          <p><strong>Role:</strong> {createdUser.role}</p>
          <p><strong>Developer Access:</strong> {createdUser.is_developer ? 'Yes' : 'No'}</p>
          {createdUser.location?.trim() ? (
            <p>
              <strong>Location:</strong> {createdUser.location}
            </p>
          ) : null}
        </div>

        <div className="bg-yellow-50 p-4 rounded-lg">
          <h3 className="font-medium text-yellow-800 mb-2">Temporary Password:</h3>
          <div className="flex items-center space-x-2">
            <code className="bg-white px-3 py-2 rounded border flex-1 font-mono">
              {tempPassword}
            </code>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => copyToClipboard(tempPassword)}
            >
              Copy
            </Button>
          </div>
          <p className="text-sm text-yellow-700 mt-2">
            Share this password with the user. They should change it on first login.
          </p>
        </div>

        <div className="bg-accent-50 p-4 rounded-lg">
          <h3 className="font-medium text-accent-800 mb-2">Next Steps:</h3>
          <p className="text-sm text-accent-700">
            The user can now sign in with their email and this temporary password. 
            They will be guided through the onboarding process to complete their profile.
          </p>
        </div>
      </>
    );

    const handleCloseSuccess = () => {
      setSuccess(false);
      setWizardStep(1);
      setExtraIconRows([]);
      setBio('');
      setPhone('');
      setAvatarDataUrl(null);
      setAvatarPreview(null);
      setImageToCrop(null);
      setShowCropper(false);
      setCurrentPlace(null);
      onSuccess();
      onClose();
    };

    if (isMobile) {
      return typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={handleCloseSuccess}
          />

          <div
            className="fixed bottom-0 left-0 right-0 z-10 flex flex-col max-h-[85dvh] min-h-0 rounded-t-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fixed Header */}
            <div className="flex-shrink-0 border-b border-gray-200 px-4 py-4 rounded-t-2xl">
              <h3 className="text-lg font-semibold text-green-600">User Created Successfully!</h3>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
              {successContent}
            </div>

            {/* Fixed Footer */}
            <div className="flex-shrink-0 border-t border-gray-200 p-4 pb-[calc(16px+env(safe-area-inset-bottom))] flex justify-end">
              <Button onClick={handleCloseSuccess}>
                Close
              </Button>
            </div>
          </div>
        </div>,
        document.body
      );
    }

    return typeof window !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-[9999]">
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
          onClick={handleCloseSuccess}
        />
        
        <div className="relative min-h-screen flex items-center justify-center p-4">
          <Card 
            className="w-full max-w-2xl max-h-[90vh] rounded-xl relative z-10 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle className="text-green-600">User Created Successfully!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {successContent}

              <div className="flex justify-end space-x-2">
                <Button onClick={handleCloseSuccess}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>,
      document.body
    );
  }

  const formFields = (
    <>
      {/* Email Field - Full Width */}
      <div>
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="user@example.com"
          required
        />
      </div>

      {/* First Name and Last Name - Stack on mobile, side-by-side on desktop */}
      <div className={cn(
        "gap-4",
        isMobile ? "space-y-4" : "grid grid-cols-2"
      )}>
        <div>
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            placeholder="John"
            required
          />
        </div>
        <div>
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            placeholder="Doe"
            required
          />
        </div>
      </div>

      {(!useWizard || wizardStep === 1) && (
        <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50/50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <User className="h-4 w-4 shrink-0" aria-hidden />
            Profile (optional)
          </p>
          <div>
            <Label htmlFor="create_user_bio">Bio</Label>
            <Textarea
              id="create_user_bio"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX_LENGTH))}
              rows={3}
              placeholder="Short bio"
              className="resize-y"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {bio.length}/{BIO_MAX_LENGTH}
            </p>
          </div>
          <div>
            <Label htmlFor="create_user_phone">Phone</Label>
            <Input
              id="create_user_phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(formatUsPhoneInput(e.target.value))}
              placeholder="(850) 586-0162"
              maxLength={14}
            />
          </div>
          <div className="space-y-1">
            <LocationPicker
              label="Location (optional)"
              fieldId="create_user_location"
              country="us"
              suggestionsPortalRef={spaceTypeSelectPortalRef}
              value={currentPlace}
              onChange={setCurrentPlace}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Same Mapbox search and confirm flow as profile edit (US).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Profile photo</Label>
            {!avatarPreview ? (
              <Input
                type="file"
                accept="image/jpeg,image/png,image/gif"
                className="cursor-pointer text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!f.type.startsWith('image/')) {
                    alert('Please choose a JPEG, PNG, or GIF image.');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setImageToCrop(reader.result as string);
                    setShowCropper(true);
                  };
                  reader.readAsDataURL(f);
                  e.target.value = '';
                }}
              />
            ) : (
              <div className="flex items-center gap-3">
                <img
                  src={avatarPreview}
                  alt=""
                  className="h-14 w-14 rounded-full border border-gray-200 object-cover"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAvatarPreview(null);
                    setAvatarDataUrl(null);
                  }}
                >
                  Remove photo
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Square crop — same tool as profile edit.</p>
          </div>
        </div>
      )}

      {/* Chapter / space — chapter admins: fixed. Developers: optional space unless Space Icon or governance. */}
      {showSpaceSection && (chapterContext ? (
        <div>
          <Label htmlFor="chapter">Chapter *</Label>
          <Input
            id="chapter"
            value={chapterContext.chapterName}
            disabled
            className="bg-gray-100"
          />
        </div>
      ) : isDeveloper ? (
        <div className="space-y-4">
          <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50/90 p-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="set_as_space_icon"
                checked={formData.setAsSpaceIcon}
                onCheckedChange={(checked) => {
                  const on = Boolean(checked);
                  setFormData((prev) => ({
                    ...prev,
                    setAsSpaceIcon: on,
                    spaceIconAttachMode: on ? prev.spaceIconAttachMode : 'existing',
                    ...(on
                      ? {}
                      : { newSpaceName: '', newSpaceCategory: '' }),
                  }));
                }}
              />
              <div className="min-w-0 space-y-1">
                <Label htmlFor="set_as_space_icon" className="cursor-pointer text-sm font-medium text-gray-900">
                  Space Icon
                </Label>
                <p className="text-xs leading-snug text-gray-600">
                  Optional: designate this user as the face of a space. Choose an existing space or create a new one
                  first—only one icon per space; assigning moves the badge from anyone else.
                </p>
              </div>
            </div>
          </div>

          {formData.setAsSpaceIcon ? (
            <div className="space-y-3 rounded-md border border-gray-200 bg-white p-3">
              <Label className="text-sm font-medium text-gray-900">Space for icon *</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={formData.spaceIconAttachMode === 'existing' ? 'default' : 'outline'}
                  className="rounded-full"
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, spaceIconAttachMode: 'existing' }));
                  }}
                >
                  Existing space
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={formData.spaceIconAttachMode === 'new' ? 'default' : 'outline'}
                  className="rounded-full"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      spaceIconAttachMode: 'new',
                      chapter: '',
                    }));
                    setChapterPickLabel('');
                  }}
                >
                  Create new space
                </Button>
              </div>

              {formData.spaceIconAttachMode === 'existing' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="chapter-space-trigger">Search spaces</Label>
                  <DeveloperSpaceSelectCombobox
                    id="chapter-space-trigger"
                    value={formData.chapter}
                    selectedLabel={chapterPickLabel}
                    onValueChange={(spaceId, spaceName) => {
                      setFormData({ ...formData, chapter: spaceId });
                      setChapterPickLabel(spaceName);
                    }}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Search the full space directory. Results update as you type.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="new_space_name">New space display name *</Label>
                    <Input
                      id="new_space_name"
                      value={formData.newSpaceName}
                      onChange={(e) => setFormData({ ...formData, newSpaceName: e.target.value })}
                      placeholder="e.g. Alpha Chapter at State U"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Organization type (optional)</Label>
                    <SearchableSelect
                      value={formData.newSpaceCategory}
                      onValueChange={(v) => setFormData((prev) => ({ ...prev, newSpaceCategory: v }))}
                      options={SPACE_TYPE_SEARCHABLE_OPTIONS}
                      placeholder="Select or type organization type…"
                      searchPlaceholder="Search types…"
                      allowCustom
                      customMaxLength={200}
                      disabled={loading}
                      portalContainerRef={spaceTypeSelectPortalRef}
                    />
                    <p className="text-xs text-muted-foreground">
                      Same taxonomy as Create space — preset slug on the row, or your own label. Used when the shell
                      space is created.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="chapter-space-trigger">
                Space {formData.role === 'governance' ? '*' : '(optional)'}
              </Label>
              <DeveloperSpaceSelectCombobox
                id="chapter-space-trigger"
                value={formData.chapter}
                selectedLabel={chapterPickLabel}
                onValueChange={(spaceId, spaceName) => {
                  setFormData({ ...formData, chapter: spaceId });
                  setChapterPickLabel(spaceName);
                }}
                disabled={loading}
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-xs text-muted-foreground">
                  {formData.role === 'governance'
                    ? 'Governance users need a home space.'
                    : 'Leave empty to create the user without a space; assign a space later from tools.'}
                </p>
                {formData.chapter ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-2 py-0.5 text-xs"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, chapter: '' }));
                      setChapterPickLabel('');
                    }}
                  >
                    Clear space
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <Label htmlFor="chapter">Chapter *</Label>
          <Select
            value={formData.chapter}
            onValueChange={(value: string) => {
              setFormData({ ...formData, chapter: value });
              const ch = chapters.find((c) => c.id === value);
              setChapterPickLabel(ch?.name ?? '');
            }}
            placeholder="Select a chapter"
          >
            {chapters.map((chapterData) => (
              <SelectItem key={chapterData.id} value={chapterData.id}>
                {chapterData.name}
              </SelectItem>
            ))}
          </Select>
        </div>
      ))}

      {isDeveloper && chapterContext ? (
        <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50/90 p-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="set_as_space_icon_ctx"
              checked={formData.setAsSpaceIcon}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, setAsSpaceIcon: Boolean(checked) }))
              }
            />
            <div className="min-w-0 space-y-1">
              <Label htmlFor="set_as_space_icon_ctx" className="cursor-pointer text-sm font-medium text-gray-900">
                Space Icon
              </Label>
              <p className="text-xs leading-snug text-gray-600">
                Assign this user as the Space Icon for the chapter above. Only one icon per space; this replaces any
                existing icon.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {showSpaceSection && isDeveloper && formData.setAsSpaceIcon && (
        <div className="space-y-3 rounded-md border border-dashed border-gray-300 bg-white/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-900">Additional Space Icon memberships</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() =>
                setExtraIconRows((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), kind: 'existing', spaceId: '', label: '' },
                ])
              }
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add space
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Home space (above) stays primary. Each row adds this user as Space Icon on another space (existing UUID or
            new shell). Duplicates with home are skipped on the server.
          </p>
          {extraIconRows.length === 0 ? (
            <p className="text-xs text-gray-500">None — optional.</p>
          ) : (
            <div className="space-y-3">
              {extraIconRows.map((row, idx) => (
                <div
                  key={row.id}
                  className="space-y-2 rounded-md border border-gray-200 bg-gray-50/80 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-600">Extra icon #{idx + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-destructive"
                      onClick={() =>
                        setExtraIconRows((prev) => prev.filter((r) => r.id !== row.id))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Remove
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={row.kind === 'existing' ? 'default' : 'outline'}
                      onClick={() =>
                        setExtraIconRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id ? { ...r, kind: 'existing', spaceId: '', label: '' } : r
                          )
                        )
                      }
                    >
                      Existing space
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={row.kind === 'new' ? 'default' : 'outline'}
                      onClick={() =>
                        setExtraIconRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id ? { ...r, kind: 'new', name: '', category: '' } : r
                          )
                        )
                      }
                    >
                      New space
                    </Button>
                  </div>
                  {row.kind === 'existing' ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={`extra-icon-space-${row.id}`}>Search space</Label>
                      <DeveloperSpaceSelectCombobox
                        id={`extra-icon-space-${row.id}`}
                        value={row.spaceId}
                        selectedLabel={row.label}
                        onValueChange={(spaceId, spaceName) => {
                          setExtraIconRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id && r.kind === 'existing'
                                ? { ...r, spaceId, label: spaceName }
                                : r
                            )
                          );
                        }}
                        disabled={loading}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <Label htmlFor={`extra-new-name-${row.id}`}>New space name *</Label>
                        <Input
                          id={`extra-new-name-${row.id}`}
                          value={row.name}
                          onChange={(e) =>
                            setExtraIconRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id && r.kind === 'new'
                                  ? { ...r, name: e.target.value }
                                  : r
                              )
                            )
                          }
                          placeholder="Display name"
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Organization type (optional)</Label>
                        <SearchableSelect
                          value={row.category}
                          onValueChange={(v) =>
                            setExtraIconRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id && r.kind === 'new' ? { ...r, category: v } : r
                              )
                            )
                          }
                          options={SPACE_TYPE_SEARCHABLE_OPTIONS}
                          placeholder="Select or type…"
                          searchPlaceholder="Search types…"
                          allowCustom
                          customMaxLength={200}
                          disabled={loading}
                          portalContainerRef={spaceTypeSelectPortalRef}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Role and Chapter Role - Stack on mobile, side-by-side on desktop */}
      {(!useWizard || wizardStep === 1) && (
      <>
      <div className={cn(
        "gap-4",
        isMobile ? "space-y-4" : "grid grid-cols-2"
      )}>
        <div>
          <Label htmlFor="role">Role *</Label>
          <Select 
            value={formData.role} 
            onValueChange={(value: string) => {
              const newRole = value as 'admin' | 'active_member' | 'alumni' | 'governance';
              setFormData({ 
                ...formData, 
                role: newRole,
                chapter_role: newRole === 'admin' ? 'president' : 'member',
                governance_chapter_ids: newRole === 'governance' ? formData.governance_chapter_ids : []
              });
            }}
          >
            <SelectItem value="active_member">Active Member</SelectItem>
            <SelectItem value="alumni">Alumni</SelectItem>
            <SelectItem value="admin">Admin / Executive</SelectItem>
            {isDeveloper && <SelectItem value="governance">Governance</SelectItem>}
          </Select>
        </div>
        <div>
          <Label htmlFor="chapter_role">Chapter Role *</Label>
          <Select
            value={['president','vice_president','secretary','treasurer','rush_chair','social_chair','philanthropy_chair','risk_management_chair','alumni_relations_chair','member','pledge'].includes(formData.chapter_role)
              ? formData.chapter_role
              : '__custom__'}
            onValueChange={(v: string) => {
              if (v === '__custom__') {
                setFormData({ ...formData, chapter_role: '' });
              } else {
                setFormData({ ...formData, chapter_role: v });
              }
            }}
          >
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="president">President</SelectItem>
            <SelectItem value="vice_president">Vice President</SelectItem>
            <SelectItem value="treasurer">Treasurer</SelectItem>
            <SelectItem value="social_chair">Social Chair</SelectItem>
            <SelectItem value="__custom__">Custom…</SelectItem>
          </Select>
          {(['president','vice_president','secretary','treasurer','rush_chair','social_chair','philanthropy_chair','risk_management_chair','alumni_relations_chair','member','pledge'].includes(formData.chapter_role) === false) && (
            <div className="mt-2">
              <Label htmlFor="chapter_role_custom">Custom Title</Label>
              <Input
                id="chapter_role_custom"
                placeholder='e.g. "Board Chair"'
                value={formData.chapter_role}
                onChange={(e) => setFormData({ ...formData, chapter_role: e.target.value })}
                required
              />
            </div>
          )}
        </div>
      </div>

      {/* Managed chapters - only when role is Governance and caller is developer */}
      {formData.role === 'governance' && isDeveloper && (
        <div className="space-y-2">
          <Label>Managed chapters</Label>
          {chaptersLoading ? (
            <p className="text-sm text-muted-foreground">Loading chapters…</p>
          ) : (
            <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
              {chapters.map((ch) => (
                <div key={ch.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`create-gov-${ch.id}`}
                    checked={formData.governance_chapter_ids.includes(ch.id)}
                    onCheckedChange={(checked) => {
                      const ids = checked
                        ? [...formData.governance_chapter_ids, ch.id]
                        : formData.governance_chapter_ids.filter((id) => id !== ch.id);
                      setFormData({ ...formData, governance_chapter_ids: ids });
                    }}
                  />
                  <Label htmlFor={`create-gov-${ch.id}`} className="text-sm font-normal cursor-pointer">
                    {ch.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Developer Access - Only show if not chapter context */}
      {!chapterContext?.isChapterAdmin && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_developer"
              checked={formData.is_developer}
              onCheckedChange={(checked) => {
                const isDev = checked as boolean;
                setFormData({ 
                  ...formData, 
                  is_developer: isDev,
                  role: isDev ? 'admin' : 'active_member'
                });
              }}
            />
            <Label htmlFor="is_developer">Developer Access</Label>
          </div>

          {formData.is_developer && (
            <div className="bg-accent-50 border border-accent-200 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-accent-500 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <p className="text-sm font-medium text-accent-800">Full Developer Access</p>
                  <p className="text-xs text-brand-accent mt-1">
                    This user will have access to all developer permissions.
                  </p>
                  <p className="text-xs text-brand-accent mt-1">
                    Role automatically set to &quot;Admin / Executive&quot; for developer access.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </>
  );

  const resetWizardLocalState = () => {
    setWizardStep(1);
    setExtraIconRows([]);
    setBio('');
    setPhone('');
    setCurrentPlace(null);
    setAvatarDataUrl(null);
    setAvatarPreview(null);
    setImageToCrop(null);
    setShowCropper(false);
  };

  const handleCancel = () => {
    resetWizardLocalState();
    onClose();
  };

  const handleAvatarCropComplete = (croppedBlob: Blob) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setAvatarDataUrl(url);
      setAvatarPreview(url);
      setShowCropper(false);
      setImageToCrop(null);
    };
    reader.readAsDataURL(croppedBlob);
  };

  const actionButtons = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleCancel}
        className={cn(
          isMobile ? 'flex-1' : 'rounded-full',
          isMobile &&
            'rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300'
        )}
        disabled={loading}
      >
        Cancel
      </Button>
      {useWizard && wizardStep === 2 && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setWizardStep(1)}
          disabled={loading}
          className={cn(isMobile ? 'flex-1' : 'rounded-full')}
        >
          Back
        </Button>
      )}
      {useWizard && wizardStep === 1 ? (
        <Button
          type="button"
          onClick={(e) => goToSpaceStep(e)}
          className={cn(
            isMobile ? 'flex-1' : 'rounded-full',
            isMobile &&
              'rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20 transition-all duration-300'
          )}
        >
          Next: home space and icon
        </Button>
      ) : (
        <Button
          type="submit"
          className={cn(
            isMobile ? 'flex-1' : 'rounded-full',
            isMobile &&
              'rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          disabled={loading}
        >
          {loading ? (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Creating...</span>
            </div>
          ) : (
            'Create User'
          )}
        </Button>
      )}
    </>
  );

  const cropperOverlay =
    imageToCrop && showCropper ? (
      <ImageCropper
        imageSrc={imageToCrop}
        isOpen={showCropper}
        onClose={() => {
          setShowCropper(false);
          setImageToCrop(null);
        }}
        onCropComplete={handleAvatarCropComplete}
        cropType="avatar"
        elevatedZIndex
      />
    ) : null;

  /** Wizard step 1 must not live inside `<form>`: Enter in inputs triggers implicit submit in some browsers. */
  const wrapBodyInForm = !useWizard || wizardStep === 2;

  // Main form - Mobile: Bottom drawer with fixed header/footer, Desktop: Centered modal
  if (isMobile) {
    return typeof window !== 'undefined' ? (
      <>
        {createPortal(
          <div className="fixed inset-0 z-[9999]">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={handleCancel}
            />

            <div
              ref={spaceTypeSelectPortalRef}
              className="fixed bottom-0 left-0 right-0 z-10 flex max-h-[85dvh] min-h-0 flex-col rounded-t-2xl bg-white shadow-xl"
              style={
                maxHeightPx !== undefined || bottomPx !== undefined
                  ? {
                      ...(maxHeightPx !== undefined && { maxHeight: `${maxHeightPx}px` }),
                      ...(bottomPx !== undefined && { bottom: `${bottomPx}px` }),
                    }
                  : undefined
              }
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-shrink-0 border-b border-gray-200 px-4 py-4 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold leading-none tracking-tight">Create New User</h3>
                    {useWizard ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Step {wizardStep} of 2 — {wizardStep === 1 ? 'Identity & access' : 'Home space & icon'}
                      </p>
                    ) : null}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={handleCancel} className="h-8 w-8 p-0">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {wrapBodyInForm ? (
                <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleFormSubmit}>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                    <div className="space-y-4">{formFields}</div>
                  </div>

                  <div className="flex flex-shrink-0 space-x-2 border-t border-gray-200 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
                    {actionButtons}
                  </div>
                </form>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                    <div className="space-y-4">{formFields}</div>
                  </div>

                  <div className="flex flex-shrink-0 space-x-2 border-t border-gray-200 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
                    {actionButtons}
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
        {cropperOverlay}
      </>
    ) : null;
  }

  return typeof window !== 'undefined' ? (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) handleCancel();
          }}
        >
          <div ref={spaceTypeSelectPortalRef} className="relative z-[10000] w-full max-w-2xl">
            <Card
              className="relative flex w-full max-h-[min(90vh,820px)] min-h-0 flex-col overflow-hidden rounded-xl shadow-xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <CardHeader className="shrink-0 border-b border-gray-200 bg-white pb-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-lg font-semibold">Create New User</CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    className="h-8 w-8 shrink-0 p-0 hover:bg-gray-100"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {useWizard ? (
                  <p className="mt-2 text-sm text-gray-500">
                    Step {wizardStep} of 2 — {wizardStep === 1 ? 'Identity & access' : 'Home space & icon'}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">Only the middle section scrolls.</p>
                )}
              </CardHeader>

              {wrapBodyInForm ? (
                <form
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  onSubmit={handleFormSubmit}
                >
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
                    <div className="space-y-4">{formFields}</div>
                  </div>

                  <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 bg-gray-50/95 px-6 py-4">
                    {actionButtons}
                  </div>
                </form>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
                    <div className="space-y-4">{formFields}</div>
                  </div>

                  <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 bg-gray-50/95 px-6 py-4">
                    {actionButtons}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>,
        document.body
      )}
      {cropperOverlay}
    </>
  ) : null;
}