'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectItem } from '@/components/ui/select';
import { X } from 'lucide-react';
import { useChapters } from '@/lib/hooks/useChapters';
import { useAuth } from '@/lib/supabase/auth-context';
import { DEVELOPER_PERMISSIONS } from '@/lib/developerPermissions';
import { DeveloperPermission } from '@/types/profile';
import { useVisualViewportHeight } from '@/lib/hooks/useVisualViewportHeight';
import { cn } from '@/lib/utils';
import { DeveloperSpaceSelectCombobox } from '@/components/user-management/DeveloperSpaceSelectCombobox';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  normalizeSpaceTypeInput,
  SPACE_TYPE_SEARCHABLE_OPTIONS,
} from '@/lib/spaceTypeTaxonomy';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      const body: Record<string, unknown> = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        chapter_role: formData.chapter_role,
        is_developer: formData.is_developer,
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
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create user');
      }

      const data = await response.json();
      
      setCreatedUser(data.user);
      setTempPassword(data.tempPassword);
      setSuccess(true);
      
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
      onSuccess();
      onClose();
    };

    if (isMobile) {
      return typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={onClose}
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
          onClick={onClose}
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

      {/* Chapter / space — chapter admins: fixed. Developers: optional space unless Space Icon or governance. */}
      {chapterContext ? (
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
      )}

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

      {/* Role and Chapter Role - Stack on mobile, side-by-side on desktop */}
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
  );

  const actionButtons = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={onClose}
        className={cn(
          isMobile ? 'flex-1' : 'rounded-full',
          isMobile &&
            'rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300'
        )}
        disabled={loading}
      >
        Cancel
      </Button>
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
    </>
  );

  // Main form - Mobile: Bottom drawer with fixed header/footer, Desktop: Centered modal
  if (isMobile) {
    return typeof window !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-[9999]">
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
          onClick={onClose}
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
          {/* Fixed Header */}
          <div className="flex-shrink-0 border-b border-gray-200 px-4 py-4 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold leading-none tracking-tight">Create New User</h3>
              <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            {/* Scrollable Body */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <div className="space-y-4">{formFields}</div>
            </div>

            {/* Fixed Footer */}
            <div className="flex flex-shrink-0 space-x-2 border-t border-gray-200 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
              {actionButtons}
            </div>
          </form>
        </div>
      </div>,
      document.body
    );
  }

  // Desktop: fixed header + scrollable body + fixed footer (matches Edit space / Create space modals)
  return typeof window !== 'undefined' && createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
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
                onClick={onClose}
                className="h-8 w-8 shrink-0 p-0 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-sm text-gray-500">Only the middle section scrolls.</p>
          </CardHeader>

          <form
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            onSubmit={handleSubmit}
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
              <div className="space-y-4">{formFields}</div>
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 bg-gray-50/95 px-6 py-4">
              {actionButtons}
            </div>
          </form>
        </Card>
      </div>
    </div>,
    document.body
  );
}