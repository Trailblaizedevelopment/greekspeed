'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Drawer } from 'vaul';
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
import { cn } from '@/lib/utils';

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
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    chapter: chapterContext?.chapterId || '',
    role: 'active_member' as 'admin' | 'active_member' | 'alumni' | 'governance',
    chapter_role: 'member' as string,
    is_developer: false,
    governance_chapter_ids: [] as string[]
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdUser, setCreatedUser] = useState<any>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  
  // Use the chapters hook to fetch available chapters
  const { chapters, loading: chaptersLoading, error: chaptersError } = useChapters();

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-populate chapter if provided
  useEffect(() => {
    if (chapterContext && chapterContext.isChapterAdmin) {
      setFormData(prev => ({ ...prev, chapter: chapterContext.chapterId }));
    }
  }, [chapterContext]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.email || !formData.firstName || !formData.lastName || !formData.chapter) {
        throw new Error('Email, firstName, lastName, and chapter are required');
      }

      const body: Record<string, unknown> = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        chapter: formData.chapter,
        role: formData.role,
        chapter_role: formData.chapter_role,
        is_developer: formData.is_developer,
      };
      if (formData.role === 'governance' && formData.governance_chapter_ids.length > 0) {
        body.governance_chapter_ids = formData.governance_chapter_ids;
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
    if (isMobile) {
      return (
        <Drawer.Root open onOpenChange={(open) => !open && onClose()} direction="bottom" modal dismissible>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm" />
            <Drawer.Content className="fixed inset-x-0 bottom-0 z-[10000] max-h-[85dvh] rounded-t-2xl border border-gray-200 bg-white shadow-2xl outline-none">
              <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-zinc-300" aria-hidden />
              <div className="flex max-h-[calc(85dvh-20px)] flex-col">
                <div className="shrink-0 border-b border-gray-200 px-4 py-3">
                  <CardTitle className="text-green-600">User Created Successfully!</CardTitle>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <div className="space-y-4">
                    <div className="bg-green-50 p-4 rounded-lg">
                      <h3 className="font-medium text-green-800 mb-2">User Details:</h3>
                      <p><strong>Name:</strong> {createdUser.full_name}</p>
                      <p><strong>Email:</strong> {createdUser.email}</p>
                      <p><strong>Chapter:</strong> {createdUser.chapter}</p>
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
                  </div>
                </div>

                <div className="shrink-0 border-t border-gray-200 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
                  <Button
                    className="w-full rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover"
                    onClick={() => {
                      setSuccess(false);
                      onSuccess();
                      onClose();
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      );
    }

    // Success modal - Mobile: Bottom drawer, Desktop: Centered
    return typeof window !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-[9999]">
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
          onClick={onClose}
        />
        
        <div className={cn(
          "relative min-h-screen",
          isMobile 
            ? "flex items-end justify-center p-0"
            : "flex items-center justify-center p-4"
        )}>
          <Card 
            className={cn(
              "w-full relative z-10 overflow-y-auto",
              isMobile
                ? "max-h-[85dvh] mt-[15dvh] rounded-t-2xl rounded-b-none pb-[env(safe-area-inset-bottom)]"
                : "max-w-2xl max-h-[90vh] rounded-xl"
            )}
            onClick={(e) => e.stopPropagation()}
          >
          <CardHeader>
            <CardTitle className="text-green-600">User Created Successfully!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-medium text-green-800 mb-2">User Details:</h3>
              <p><strong>Name:</strong> {createdUser.full_name}</p>
              <p><strong>Email:</strong> {createdUser.email}</p>
              <p><strong>Chapter:</strong> {createdUser.chapter}</p>
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

            <div className="flex justify-end space-x-2">
              <Button onClick={() => {
                setSuccess(false);
                onSuccess();
                onClose();
              }}>
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

  if (isMobile) {
    return (
      <Drawer.Root open onOpenChange={(open) => !open && onClose()} direction="bottom" modal dismissible>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[10000] max-h-[85dvh] rounded-t-2xl border border-gray-200 bg-white shadow-2xl outline-none">
            <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-zinc-300" aria-hidden />
            <div className="flex max-h-[calc(85dvh-20px)] flex-col">
              {/* Header */}
              <div className="shrink-0 border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <CardTitle>Create New User</CardTitle>
                  <Button variant="ghost" size="sm" onClick={onClose}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Form body - only scrollable section */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-4">
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

                  {/* First Name and Last Name - Stack on mobile */}
                  <div className="space-y-4">
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

                  {/* Chapter Field - Full Width */}
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
                  ) : (
                    <div>
                      <Label htmlFor="chapter">Chapter *</Label>
                      <Select
                        value={formData.chapter}
                        onValueChange={(value: string) => setFormData({ ...formData, chapter: value })}
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

                  {/* Role and Chapter Role - Stack on mobile */}
                  <div className="space-y-4">
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
                </div>
              </div>

              {/* Footer */}
              <div className="shrink-0 border-t border-gray-200 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="flex-1 rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    className="flex-1 rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
                </div>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  // Main form - Mobile: Bottom drawer, Desktop: Centered
  return typeof window !== 'undefined' && createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      <div className={cn(
        "relative min-h-screen",
        isMobile 
          ? "flex items-end justify-center p-0"
          : "flex items-center justify-center p-4"
      )}>
        <Card 
          className={cn(
            "w-full relative z-10 overflow-y-auto",
            isMobile
              ? "max-h-[85dvh] mt-[15dvh] rounded-t-2xl rounded-b-none pb-[env(safe-area-inset-bottom)] bg-white shadow-xl"
              : "max-w-2xl mx-4 max-h-[90vh] rounded-xl"
          )}
          onClick={(e) => e.stopPropagation()}
        >
        <CardHeader className={cn("pb-2", isMobile ? "flex-shrink-0" : "")}>
          <div className="flex items-center justify-between">
            <CardTitle>Create New User</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className={cn(
          "space-y-4 pt-0",
          isMobile ? "flex-1 overflow-y-auto" : ""
        )}>
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

          {/* Chapter Field - Full Width */}
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
          ) : (
            <div>
              <Label htmlFor="chapter">Chapter *</Label>
              <Select 
                value={formData.chapter} 
                onValueChange={(value: string) => setFormData({ ...formData, chapter: value })}
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

          {/* Action Buttons - Mobile: Rounded-full pills, Desktop: Standard */}
          <div className={cn(
            "flex space-x-2 pt-4 flex-shrink-0 border-t border-gray-200",
            isMobile ? "p-4 pb-[calc(16px+env(safe-area-inset-bottom))] mt-4" : ""
          )}>
            <Button 
              variant="outline" 
              onClick={onClose} 
              className={cn(
                "flex-1",
                isMobile && "rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
              )}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              className={cn(
                "flex-1",
                isMobile && "rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>
        </CardContent>
      </Card>
        </div>
      </div>,
      document.body
    );
}
