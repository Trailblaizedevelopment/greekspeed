'use client';

import { useCallback, useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SpaceMembershipAssignPanel } from '@/components/user-management/SpaceMembershipAssignPanel';
import { FieldHint } from '@/components/user-management/FieldHint';
import { Loader2, Users, UserPlus, Pencil, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';

function preventSpaceManageDrawerPortaledUi(event: { preventDefault: () => void; target: EventTarget | null }) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('[data-trailblaize-dropdown-portal]')) {
    event.preventDefault();
  }
}

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
  const [isMobile, setIsMobile] = useState(false);
  const [tab, setTab] = useState<TabId>('members');
  const [members, setMembers] = useState<SpaceMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersSearch, setMembersSearch] = useState('');
  const [membersSearchDebounced, setMembersSearchDebounced] = useState('');
  const [membersPage, setMembersPage] = useState(1);
  const [membersLimit] = useState(25);
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersTotalPages, setMembersTotalPages] = useState(1);
  const [quick, setQuick] = useState({
    name: '',
    slug: '',
    school: '',
    national_fraternity: '',
    chapter_name: '',
    space_type: '',
  });
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setMembersSearchDebounced(membersSearch.trim()), 250);
    return () => window.clearTimeout(t);
  }, [membersSearch]);

  const loadMembers = useCallback(async () => {
    if (!chapter?.id || !accessToken) return;
    setMembersLoading(true);
    try {
      const query = new URLSearchParams({
        page: String(membersPage),
        limit: String(membersLimit),
      });
      if (membersSearchDebounced.length > 0) {
        query.set('q', membersSearchDebounced);
      }
      const r = await fetch(`/api/developer/spaces/${chapter.id}/members?${query.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) {
        toast.error('Failed to load members');
        return;
      }
      const j = (await r.json()) as {
        members?: SpaceMemberRow[];
        total?: number;
        totalPages?: number;
      };
      setMembers(j.members ?? []);
      setMembersTotal(j.total ?? 0);
      setMembersTotalPages(j.totalPages ?? 1);
    } finally {
      setMembersLoading(false);
    }
  }, [chapter?.id, accessToken, membersPage, membersLimit, membersSearchDebounced]);

  useEffect(() => {
    if (!open || !chapter) return;
    setTab('members');
    setMembersPage(1);
    setMembersSearch('');
    setMembersSearchDebounced('');
    setMembersTotal(0);
    setMembersTotalPages(1);
    setQuick({
      name: chapter.name ?? '',
      slug: chapter.slug ?? '',
      school: chapter.school ?? '',
      national_fraternity: chapter.national_fraternity ?? '',
      chapter_name: chapter.chapter_name ?? '',
      space_type: chapter.space_type ?? '',
    });
  }, [open, chapter]);

  useEffect(() => {
    if (tab !== 'members' || !open || !chapter || !accessToken) return;
    void loadMembers();
  }, [tab, open, chapter, accessToken, loadMembers]);

  useEffect(() => {
    setMembersPage(1);
  }, [membersSearchDebounced]);

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
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom" modal dismissible>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/40 transition-opacity" />
        <Drawer.Content
          className={cn(
            'bg-white flex flex-col z-[10000] fixed bottom-0 left-0 right-0 shadow-2xl border border-gray-200 outline-none',
            isMobile ? 'max-h-[85dvh] rounded-t-[20px]' : 'max-h-[80vh] max-w-lg mx-auto rounded-t-[20px]'
          )}
          onPointerDownOutside={preventSpaceManageDrawerPortaledUi}
          onInteractOutside={preventSpaceManageDrawerPortaledUi}
        >
          {isMobile ? (
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mt-3 mb-1" aria-hidden />
          ) : null}

          <div className="flex flex-col h-full min-h-0 max-h-[inherit]">
            <div className="flex items-start justify-between gap-3 px-4 pt-2 sm:pt-4 pb-3 border-b border-gray-100 shrink-0">
              <div className="flex-1 min-w-0 text-left space-y-1 pr-2">
                <Drawer.Title className="text-lg font-semibold text-gray-900">Space / chapter</Drawer.Title>
                <Drawer.Description className="text-sm font-medium text-gray-900 truncate">
                  {chapter.name}
                </Drawer.Description>
                <p className="text-xs font-mono text-gray-500 break-all">{chapter.id}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

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

            <div
              className={cn(
                'flex-1 min-h-0 overflow-y-auto p-4 space-y-4',
                isMobile && 'pb-[calc(1rem+env(safe-area-inset-bottom))]'
              )}
            >
            {tab === 'members' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    {membersTotal.toLocaleString()} active membership{membersTotal === 1 ? '' : 's'}
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadMembers()}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${membersLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={membersSearch}
                    onChange={(e) => setMembersSearch(e.target.value)}
                    placeholder="Search members by name, email, or user id…"
                    className="pl-9"
                  />
                </div>
                {membersLoading ? (
                  <div className="flex justify-center py-8 text-gray-500">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    {membersSearchDebounced ? 'No members match this search.' : 'No active members yet.'}
                  </p>
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
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-gray-500">
                    Showing {membersTotal === 0 ? 0 : (membersPage - 1) * membersLimit + 1} to{' '}
                    {Math.min(membersPage * membersLimit, membersTotal)} of {membersTotal.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={membersPage <= 1 || membersLoading}
                      onClick={() => setMembersPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-gray-600 tabular-nums">
                      Page {membersPage} / {membersTotalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={membersPage >= membersTotalPages || membersLoading}
                      onClick={() => setMembersPage((p) => Math.min(membersTotalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
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
                <p className="text-xs text-gray-500 leading-relaxed">
                  Updates plain-text columns on <span className="font-mono">spaces</span> only. To link directory rows
                  (<span className="font-mono">school_id</span>, <span className="font-mono">national_organization_id</span>
                  ), use full chapter edit.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="qe-name">Name</Label>
                    <FieldHint text="spaces.name — primary title shown in lists, search, and the chapter switcher." />
                  </div>
                  <Input id="qe-name" value={quick.name} onChange={(e) => setQuick((q) => ({ ...q, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="qe-slug">Slug</Label>
                    <FieldHint text="spaces.slug — stable URL-style identifier on the row (developer search matches it). You can edit freely; the database may still require it to stay unique. Nothing in this quick form changes foreign keys." />
                  </div>
                  <Input id="qe-slug" value={quick.slug} onChange={(e) => setQuick((q) => ({ ...q, slug: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="qe-school">School (label)</Label>
                    <FieldHint text="spaces.school — denormalized short label stored for display and search. Not the same as school_id; directory school linking is done in full edit." />
                  </div>
                  <Input id="qe-school" value={quick.school} onChange={(e) => setQuick((q) => ({ ...q, school: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="qe-nat">National / category</Label>
                    <FieldHint text="spaces.national_fraternity — category or national line text on the row. Not national_organization_id; link the directory org in full edit." />
                  </div>
                  <Input
                    id="qe-nat"
                    value={quick.national_fraternity}
                    onChange={(e) => setQuick((q) => ({ ...q, national_fraternity: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="qe-ch">Chapter name</Label>
                    <FieldHint text="spaces.chapter_name — local designation (for example Greek letters or a short branch label) shown next to the full name." />
                  </div>
                  <Input
                    id="qe-ch"
                    value={quick.chapter_name}
                    onChange={(e) => setQuick((q) => ({ ...q, chapter_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="qe-st">Space type</Label>
                    <FieldHint text="spaces.space_type — internal grouping key (for example seed category). Plain text on the row, not a foreign key." />
                  </div>
                  <Input
                    id="qe-st"
                    value={quick.space_type}
                    onChange={(e) => setQuick((q) => ({ ...q, space_type: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    className="rounded-full"
                    onClick={() => void saveQuickEdit()}
                    disabled={saveLoading || !accessToken}
                  >
                    {saveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => onRequestFullEdit(chapter)}>
                    Open full edit modal
                  </Button>
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
