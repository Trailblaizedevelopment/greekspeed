'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SpaceMembershipAssignPanel } from '@/components/user-management/SpaceMembershipAssignPanel';
import { Loader2, Users, UserPlus, Pencil, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';

export type ChapterRow = {
  id: string;
  name: string;
  description?: string;
  location?: string;
  member_count?: number;
  founded_year?: number;
  university?: string;
  slug?: string;
  national_fraternity?: string;
  chapter_name?: string;
  school?: string;
  school_location?: string;
  chapter_status?: string;
  space_type?: string | null;
};

type TabId = 'members' | 'assign' | 'quick_edit';

type SpaceMemberRow = {
  membership_id: string;
  user_id: string;
  role: string;
  status: string;
  is_primary: boolean;
  is_space_icon: boolean;
  email: string | null;
  full_name: string | null;
};

type ChapterSpaceManageSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapter: ChapterRow | null;
  accessToken: string | undefined;
  onRequestFullEdit: (chapter: ChapterRow) => void;
  onSpaceUpdated: () => void;
};

export function ChapterSpaceManageSheet({
  open,
  onOpenChange,
  chapter,
  accessToken,
  onRequestFullEdit,
  onSpaceUpdated,
}: ChapterSpaceManageSheetProps) {
  const [tab, setTab] = useState<TabId>('members');
  const [members, setMembers] = useState<SpaceMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [quick, setQuick] = useState({
    name: '',
    slug: '',
    school: '',
    national_fraternity: '',
    chapter_name: '',
    space_type: '',
  });
  const [saveLoading, setSaveLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!chapter?.id || !accessToken) return;
    setMembersLoading(true);
    try {
      const r = await fetch(`/api/developer/spaces/${chapter.id}/members`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) {
        toast.error('Failed to load members');
        return;
      }
      const j = (await r.json()) as { members?: SpaceMemberRow[] };
      setMembers(j.members ?? []);
    } finally {
      setMembersLoading(false);
    }
  }, [chapter?.id, accessToken]);

  useEffect(() => {
    if (!open || !chapter) return;
    setTab('members');
    setQuick({
      name: chapter.name ?? '',
      slug: chapter.slug ?? '',
      school: chapter.school ?? '',
      national_fraternity: chapter.national_fraternity ?? '',
      chapter_name: chapter.chapter_name ?? '',
      space_type: chapter.space_type ?? '',
    });
    if (accessToken) void loadMembers();
  }, [open, chapter, accessToken, loadMembers]);

  const saveQuickEdit = async () => {
    if (!chapter?.id || !accessToken) return;
    setSaveLoading(true);
    try {
      const r = await fetch(`/api/developer/spaces/${chapter.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: quick.name.trim() || undefined,
          slug: quick.slug.trim() || undefined,
          school: quick.school.trim() || undefined,
          national_fraternity: quick.national_fraternity.trim() || undefined,
          chapter_name: quick.chapter_name.trim() || undefined,
          space_type: quick.space_type.trim() || undefined,
        }),
      });
      const j: unknown = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err = typeof j === 'object' && j && 'error' in j ? String((j as { error: string }).error) : 'Save failed';
        toast.error(err);
        return;
      }
      toast.success('Space updated');
      onSpaceUpdated();
    } finally {
      setSaveLoading(false);
    }
  };

  if (!chapter) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 gap-0 h-full max-h-screen overflow-hidden"
      >
        <div className="flex flex-col h-full min-h-0">
          <SheetHeader className="px-4 py-3 border-b shrink-0 text-left space-y-1">
            <SheetTitle className="pr-8">Space / chapter</SheetTitle>
            <p className="text-sm font-medium text-gray-900 truncate">{chapter.name}</p>
            <p className="text-xs font-mono text-gray-500 break-all">{chapter.id}</p>
          </SheetHeader>

          <div className="flex border-b shrink-0 px-2 gap-1">
            <button
              type="button"
              className={`px-3 py-2 text-sm rounded-t-md ${
                tab === 'members' ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50'
              }`}
              onClick={() => setTab('members')}
            >
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                Members
              </span>
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-sm rounded-t-md ${
                tab === 'assign' ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50'
              }`}
              onClick={() => setTab('assign')}
            >
              <span className="inline-flex items-center gap-1">
                <UserPlus className="h-3.5 w-3.5" />
                Assign
              </span>
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-sm rounded-t-md ${
                tab === 'quick_edit' ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50'
              }`}
              onClick={() => setTab('quick_edit')}
            >
              <span className="inline-flex items-center gap-1">
                <Pencil className="h-3.5 w-3.5" />
                Quick edit
              </span>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {tab === 'members' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    {members.length} active membership{members.length === 1 ? '' : 's'}
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadMembers()}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${membersLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
                {membersLoading ? (
                  <div className="flex justify-center py-8 text-gray-500">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-gray-500">No active members yet.</p>
                ) : (
                  <ul className="divide-y rounded-md border border-gray-200 text-sm">
                    {members.map((m) => (
                      <li key={m.membership_id} className="p-3 space-y-0.5">
                        <div className="font-medium text-gray-900">{m.full_name || '—'}</div>
                        <div className="text-xs text-gray-600">{m.email || '—'}</div>
                        <div className="text-[10px] font-mono text-gray-400 break-all">{m.user_id}</div>
                        <div className="flex flex-wrap gap-2 text-xs text-gray-600 pt-1">
                          <span>role: {m.role}</span>
                          <span>status: {m.status}</span>
                          {m.is_primary ? (
                            <span className="text-amber-800 font-medium">primary</span>
                          ) : null}
                          {m.is_space_icon ? <span className="text-brand-primary font-medium">icon</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === 'assign' && accessToken ? (
              <SpaceMembershipAssignPanel
                accessToken={accessToken}
                spaceId={chapter.id}
                onAssigned={() => void loadMembers()}
              />
            ) : null}

            {tab === 'assign' && !accessToken ? (
              <p className="text-sm text-gray-500">Sign in to assign members.</p>
            ) : null}

            {tab === 'quick_edit' ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="qe-name">Name</Label>
                  <Input id="qe-name" value={quick.name} onChange={(e) => setQuick((q) => ({ ...q, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qe-slug">Slug</Label>
                  <Input id="qe-slug" value={quick.slug} onChange={(e) => setQuick((q) => ({ ...q, slug: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qe-school">School (label)</Label>
                  <Input id="qe-school" value={quick.school} onChange={(e) => setQuick((q) => ({ ...q, school: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qe-nat">National / category string</Label>
                  <Input
                    id="qe-nat"
                    value={quick.national_fraternity}
                    onChange={(e) => setQuick((q) => ({ ...q, national_fraternity: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qe-ch">Chapter name</Label>
                  <Input
                    id="qe-ch"
                    value={quick.chapter_name}
                    onChange={(e) => setQuick((q) => ({ ...q, chapter_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qe-st">space_type</Label>
                  <Input
                    id="qe-st"
                    value={quick.space_type}
                    onChange={(e) => setQuick((q) => ({ ...q, space_type: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" onClick={() => void saveQuickEdit()} disabled={saveLoading || !accessToken}>
                    {saveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => onRequestFullEdit(chapter)}>
                    Open full edit modal
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
