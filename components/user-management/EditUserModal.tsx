'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { X } from 'lucide-react';
import { useChapters } from '@/lib/hooks/useChapters';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useAuth } from '@/lib/supabase/auth-context';

type SystemRoleOption = 'admin' | 'active_member' | 'alumni' | 'governance';

type MembershipRoleInSpace = 'active_member' | 'alumni';

type SpaceMembershipRow = {
  space_id: string;
  space_name: string;
  membership_role: MembershipRoleInSpace;
};

interface User {
  id: string;
  role: string | null;
  chapter_role: string | null;
  governance_chapter_ids?: string[];
}

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSaved: () => void;
}

export function EditUserModal({ isOpen, onClose, user, onSaved }: EditUserModalProps) {
  const { isDeveloper } = useProfile();
  const { session, getAuthHeaders } = useAuth();
  const [role, setRole] = useState<SystemRoleOption>('active_member');
  const [chapterRole, setChapterRole] = useState<string>('member');
  const [governanceChapterIds, setGovernanceChapterIds] = useState<string[]>([]);
  const [additionalMemberships, setAdditionalMemberships] = useState<SpaceMembershipRow[]>([]);
  const initialAdditionalRolesRef = useRef<Map<string, MembershipRoleInSpace>>(new Map());
  const [saving, setSaving] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const { chapters, loading: chaptersLoading } = useChapters();

  useEffect(() => {
    if (!isOpen || !user || !session) return;
    setLoadingUser(true);
    // Intentionally depend on user.id (not whole user) to avoid parent identity churn; getAuthHeaders is stable enough for fetch.
    fetch(`/api/developer/users?userId=${user.id}`, {
      headers: getAuthHeaders(),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to fetch user'))))
      .then((data) => {
        const u = data.user;
        const r = (u?.role as string) || 'active_member';
        setRole(['admin', 'active_member', 'alumni', 'governance'].includes(r) ? (r as SystemRoleOption) : 'active_member');
        setChapterRole(u?.chapter_role || 'member');
        setGovernanceChapterIds(Array.isArray(u?.governance_chapter_ids) ? u.governance_chapter_ids : []);

        const raw = u?.space_memberships as
          | {
              space_id: string;
              space_name?: string;
              membership_role?: string;
              is_primary?: boolean;
            }[]
          | undefined;

        const additional: SpaceMembershipRow[] = (raw ?? [])
          .filter((m) => !m.is_primary)
          .map((m) => ({
            space_id: m.space_id,
            space_name: typeof m.space_name === 'string' ? m.space_name : 'Unknown space',
            membership_role: m.membership_role === 'alumni' ? 'alumni' : 'active_member',
          }));
        setAdditionalMemberships(additional);
        initialAdditionalRolesRef.current = new Map(
          additional.map((row) => [row.space_id, row.membership_role])
        );
      })
      .catch(() => {
        setRole((user.role as SystemRoleOption) || 'active_member');
        setChapterRole(user.chapter_role || 'member');
        setGovernanceChapterIds([]);
        setAdditionalMemberships([]);
        initialAdditionalRolesRef.current = new Map();
      })
      .finally(() => setLoadingUser(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [isOpen, user?.id, session, user?.role, user?.chapter_role]);

  useEffect(() => {
    if (!isOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  if (!isOpen || !user) return null;

  const toggleGovernanceChapter = (chapterId: string) => {
    setGovernanceChapterIds((prev) =>
      prev.includes(chapterId) ? prev.filter((id) => id !== chapterId) : [...prev, chapterId]
    );
  };

  const predefined = [
    'president',
    'vice_president',
    'secretary',
    'treasurer',
    'rush_chair',
    'social_chair',
    'philanthropy_chair',
    'risk_management_chair',
    'alumni_relations_chair',
    'member',
    'pledge',
  ];

  const handleSave = async () => {
    try {
      setSaving(true);
      const body: Record<string, unknown> = { role, chapter_role: chapterRole };
      if (role === 'governance') body.governance_chapter_ids = governanceChapterIds;

      if (isDeveloper && additionalMemberships.length > 0) {
        const updates: { space_id: string; membership_role: MembershipRoleInSpace }[] = [];
        for (const row of additionalMemberships) {
          const initial = initialAdditionalRolesRef.current.get(row.space_id);
          if (initial !== row.membership_role) {
            updates.push({ space_id: row.space_id, membership_role: row.membership_role });
          }
        }
        if (updates.length > 0) {
          body.space_membership_roles = updates;
        }
      }

      const resp = await fetch(`/api/developer/users?userId=${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.error || 'Failed to update user');
      }
      onSaved();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const setMembershipRole = (spaceId: string, membership_role: MembershipRoleInSpace) => {
    setAdditionalMemberships((prev) =>
      prev.map((r) => (r.space_id === spaceId ? { ...r, membership_role } : r))
    );
  };

  const modal = (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="absolute inset-0 flex items-center justify-center p-4 overflow-y-auto">
        <Card className="w-full max-w-xl shadow-xl my-4">
          <CardHeader className="p-6 pb-2 flex flex-row items-center justify-between">
            <CardTitle>Edit User</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent className="space-y-4 max-h-[min(85vh,720px)] overflow-y-auto">
            <div>
              <Label>System Role</Label>
              <Select
                value={role}
                onValueChange={(v: string) => setRole(v as SystemRoleOption)}
                disabled={loadingUser}
              >
                <SelectItem value="active_member">Active Member</SelectItem>
                <SelectItem value="alumni">Alumni</SelectItem>
                <SelectItem value="admin">Admin / Executive</SelectItem>
                {(isDeveloper || role === 'governance') && (
                  <SelectItem value="governance">Governance</SelectItem>
                )}
              </Select>
            </div>

            {role === 'governance' && isDeveloper && (
              <div className="space-y-2">
                <Label>Managed chapters</Label>
                {chaptersLoading ? (
                  <p className="text-sm text-muted-foreground">Loading chapters…</p>
                ) : (
                  <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                    {chapters.map((ch) => (
                      <div key={ch.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`gov-${ch.id}`}
                          checked={governanceChapterIds.includes(ch.id)}
                          onCheckedChange={() => toggleGovernanceChapter(ch.id)}
                        />
                        <Label htmlFor={`gov-${ch.id}`} className="text-sm font-normal cursor-pointer">
                          {ch.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Chapter Role (home chapter)</Label>
              <Select
                value={predefined.includes(chapterRole) ? chapterRole : '__custom__'}
                onValueChange={(v: string) => {
                  if (v === '__custom__') setChapterRole('');
                  else setChapterRole(v);
                }}
              >
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="president">President</SelectItem>
                <SelectItem value="vice_president">Vice President</SelectItem>
                <SelectItem value="treasurer">Treasurer</SelectItem>
                <SelectItem value="social_chair">Social Chair</SelectItem>
                <SelectItem value="__custom__">Custom…</SelectItem>
              </Select>

              {!predefined.includes(chapterRole) && (
                <div className="mt-2">
                  <Label htmlFor="chapter_role_custom">Custom Title</Label>
                  <Input
                    id="chapter_role_custom"
                    placeholder='e.g. "Historian"'
                    value={chapterRole}
                    onChange={(e) => setChapterRole(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>

            {isDeveloper && (
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                <Label>Additional chapter memberships</Label>
                <p className="text-xs text-gray-600">
                  Spaces beyond the user&apos;s primary (home) chapter. Role here maps to membership active vs alumni
                  in that space.
                </p>
                {loadingUser ? (
                  <p className="text-sm text-muted-foreground">Loading memberships…</p>
                ) : additionalMemberships.length === 0 ? (
                  <p className="text-sm text-gray-600">No additional spaces linked for this user.</p>
                ) : (
                  <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {additionalMemberships.map((row) => (
                      <li
                        key={row.space_id}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 rounded-md border border-gray-100 bg-white px-3 py-2"
                      >
                        <span className="text-sm font-medium text-gray-900 truncate" title={row.space_name}>
                          {row.space_name}
                        </span>
                        <div className="w-full sm:w-48 shrink-0">
                          <Select
                            value={row.membership_role}
                            onValueChange={(v: string) =>
                              setMembershipRole(row.space_id, v as MembershipRoleInSpace)
                            }
                            disabled={loadingUser || saving}
                          >
                            <SelectItem value="active_member">Active member</SelectItem>
                            <SelectItem value="alumni">Alumni</SelectItem>
                          </Select>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
