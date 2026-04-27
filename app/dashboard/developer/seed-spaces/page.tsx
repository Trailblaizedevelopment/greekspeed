'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DeveloperPortal } from '@/components/features/dashboard/dashboards/DeveloperPortal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useAuth } from '@/lib/supabase/auth-context';
import type { DeveloperSpaceSearchResult } from '@/lib/services/developerSpaceSearchService';
import { Loader2, Search, Plus, UserPlus, Trash2, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';

export default function DeveloperSeedSpacesPage() {
  return <DeveloperSeedSpacesContent />;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DevUserPick = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type MembershipRow = {
  id: string;
  userQuery: string;
  userResults: DevUserPick[];
  userLoading: boolean;
  userMenuOpen: boolean;
  selectedUser: DevUserPick | null;
  spaceQuery: string;
  spaceResults: DeveloperSpaceSearchResult[];
  spaceLoading: boolean;
  spaceMenuOpen: boolean;
  selectedSpace: DeveloperSpaceSearchResult | null;
  spaceIdManual: string;
  isPrimary: boolean;
  /** Loaded when “home space” is checked — mirrors `profiles.chapter_id` / `chapter`. */
  homeSpaceLookupLoading: boolean;
  homeSpaceChapterId: string | null;
  homeSpaceChapterDisplay: string | null;
  rowMessage: string | null;
};

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function newRow(): MembershipRow {
  return {
    id: crypto.randomUUID(),
    userQuery: '',
    userResults: [],
    userLoading: false,
    userMenuOpen: false,
    selectedUser: null,
    spaceQuery: '',
    spaceResults: [],
    spaceLoading: false,
    spaceMenuOpen: false,
    selectedSpace: null,
    spaceIdManual: '',
    isPrimary: false,
    homeSpaceLookupLoading: false,
    homeSpaceChapterId: null,
    homeSpaceChapterDisplay: null,
    rowMessage: null,
  };
}

function displayUser(u: DevUserPick): string {
  const name = (u.full_name || '').trim() || 'No name';
  const em = (u.email || '').trim();
  return em ? `${name} · ${em}` : name;
}

function MembershipAssignRowEditor({
  token,
  row,
  onPatch,
  onRemove,
  canRemove,
  onAssignOne,
  oneLoading,
}: {
  token: string | null;
  row: MembershipRow;
  onPatch: (id: string, p: Partial<MembershipRow>) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
  onAssignOne: (id: string) => void;
  oneLoading: boolean;
}) {
  const debouncedUserQ = useDebouncedValue(row.userQuery.trim(), 320);
  const debouncedSpaceQ = useDebouncedValue(row.spaceQuery.trim(), 320);
  const targetSpaceId = (row.spaceIdManual.trim() || row.selectedSpace?.id || '').trim();
  const newHomeLabel =
    (row.selectedSpace?.name || '').trim() ||
    (targetSpaceId ? `Space ${targetSpaceId.slice(0, 8)}…` : '');

  useEffect(() => {
    if (!token || !row.selectedUser || !row.isPrimary) {
      onPatch(row.id, {
        homeSpaceLookupLoading: false,
        homeSpaceChapterId: null,
        homeSpaceChapterDisplay: null,
      });
      return;
    }

    let cancelled = false;
    onPatch(row.id, { homeSpaceLookupLoading: true });

    (async () => {
      try {
        const r = await fetch(`/api/developer/users?userId=${encodeURIComponent(row.selectedUser!.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!r.ok) {
          onPatch(row.id, {
            homeSpaceLookupLoading: false,
            homeSpaceChapterId: null,
            homeSpaceChapterDisplay: null,
          });
          return;
        }
        const j = (await r.json()) as { user?: { chapter_id?: string | null; chapter?: string | null } };
        const u = j.user;
        onPatch(row.id, {
          homeSpaceLookupLoading: false,
          homeSpaceChapterId: (u?.chapter_id as string | undefined) ?? null,
          homeSpaceChapterDisplay: (u?.chapter as string | undefined) ?? null,
        });
      } catch {
        if (!cancelled) {
          onPatch(row.id, {
            homeSpaceLookupLoading: false,
            homeSpaceChapterId: null,
            homeSpaceChapterDisplay: null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, row.selectedUser?.id, row.isPrimary, row.id, onPatch]);

  // User suggestions
  useEffect(() => {
    if (!token || row.selectedUser) return;
    const q = debouncedUserQ;
    if (q.length < 2) {
      if (row.userResults.length > 0 || row.userLoading || row.userMenuOpen) {
        onPatch(row.id, { userResults: [], userLoading: false, userMenuOpen: false });
      }
      return;
    }

    let cancelled = false;
    onPatch(row.id, { userLoading: true });

    (async () => {
      try {
        if (UUID_RE.test(q)) {
          const r = await fetch(`/api/developer/users?userId=${encodeURIComponent(q)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (cancelled) return;
          if (!r.ok) {
            onPatch(row.id, { userResults: [], userLoading: false, userMenuOpen: true });
            return;
          }
          const j = (await r.json()) as { user?: DevUserPick };
          const u = j.user;
          const pick: DevUserPick[] = u?.id
            ? [
                {
                  id: u.id,
                  email: (u as { email?: string | null }).email ?? null,
                  full_name: (u as { full_name?: string | null }).full_name ?? null,
                },
              ]
            : [];
          onPatch(row.id, {
            userResults: pick,
            userLoading: false,
            userMenuOpen: pick.length > 0,
          });
          return;
        }

        const r = await fetch(
          `/api/developer/users?q=${encodeURIComponent(q)}&limit=15&page=1`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (cancelled) return;
        if (!r.ok) {
          onPatch(row.id, { userResults: [], userLoading: false, userMenuOpen: false });
          return;
        }
        const j = (await r.json()) as { users?: DevUserPick[] };
        const list = (j.users ?? []).map((u) => ({
          id: u.id,
          email: u.email ?? null,
          full_name: u.full_name ?? null,
        }));
        onPatch(row.id, {
          userResults: list,
          userLoading: false,
          userMenuOpen: list.length > 0,
        });
      } catch {
        if (!cancelled) onPatch(row.id, { userResults: [], userLoading: false, userMenuOpen: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, debouncedUserQ, row.selectedUser, row.id, onPatch]);

  // Space suggestions
  useEffect(() => {
    if (!token || row.selectedSpace) return;
    const q = debouncedSpaceQ;
    if (q.length < 2) {
      if (row.spaceResults.length > 0 || row.spaceLoading || row.spaceMenuOpen) {
        onPatch(row.id, { spaceResults: [], spaceLoading: false, spaceMenuOpen: false });
      }
      return;
    }

    let cancelled = false;
    onPatch(row.id, { spaceLoading: true });

    (async () => {
      try {
        const r = await fetch(
          `/api/developer/spaces/search?q=${encodeURIComponent(q)}&limit=15`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (cancelled) return;
        if (!r.ok) {
          onPatch(row.id, { spaceResults: [], spaceLoading: false, spaceMenuOpen: false });
          return;
        }
        const j = (await r.json()) as { spaces?: DeveloperSpaceSearchResult[] };
        const list = j.spaces ?? [];
        onPatch(row.id, {
          spaceResults: list,
          spaceLoading: false,
          spaceMenuOpen: list.length > 0,
        });
      } catch {
        if (!cancelled) onPatch(row.id, { spaceResults: [], spaceLoading: false, spaceMenuOpen: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, debouncedSpaceQ, row.selectedSpace, row.id, onPatch]);

  const spaceIdForSubmit = row.spaceIdManual.trim() || row.selectedSpace?.id || '';
  const canSubmitOne = Boolean(row.selectedUser && spaceIdForSubmit);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Membership row</div>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => onRemove(row.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {/* User */}
      <div className="space-y-1.5 relative">
        <Label className="text-sm">Member</Label>
        {row.selectedUser ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <span className="text-gray-900">{displayUser(row.selectedUser)}</span>
            <span className="text-xs font-mono text-gray-500 break-all">{row.selectedUser.id}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto h-7"
              onClick={() =>
                onPatch(row.id, {
                  selectedUser: null,
                  userQuery: '',
                  userResults: [],
                  userMenuOpen: false,
                  homeSpaceLookupLoading: false,
                  homeSpaceChapterId: null,
                  homeSpaceChapterDisplay: null,
                })
              }
            >
              Change
            </Button>
          </div>
        ) : (
          <>
            <Input
              value={row.userQuery}
              onChange={(e) => {
                const v = e.target.value;
                onPatch(row.id, { userQuery: v, userMenuOpen: v.trim().length >= 2 });
              }}
              onFocus={() => {
                if (row.userResults.length > 0) onPatch(row.id, { userMenuOpen: true });
              }}
              onBlur={() => {
                setTimeout(() => onPatch(row.id, { userMenuOpen: false }), 180);
              }}
              placeholder="Start typing name, email, or paste user UUID…"
              autoComplete="off"
            />
            {row.userLoading ? (
              <div className="absolute right-3 top-9 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : null}
            {row.userMenuOpen && row.userResults.length > 0 ? (
              <ul
                className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
                role="listbox"
              >
                {row.userResults.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-gray-100"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() =>
                        onPatch(row.id, {
                          selectedUser: u,
                          userQuery: '',
                          userResults: [],
                          userMenuOpen: false,
                          homeSpaceLookupLoading: false,
                          homeSpaceChapterId: null,
                          homeSpaceChapterDisplay: null,
                        })
                      }
                    >
                      <span className="font-medium text-gray-900">
                        {(u.full_name || '').trim() || '—'}
                      </span>
                      <span className="text-xs text-gray-600">{u.email || '—'}</span>
                      <span className="text-[10px] font-mono text-gray-400 break-all">{u.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!row.userLoading && debouncedUserQ.length >= 2 && row.userResults.length === 0 && !row.userMenuOpen ? (
              <p className="text-xs text-gray-500">No users match that search.</p>
            ) : null}
          </>
        )}
      </div>

      {/* Space */}
      <div className="space-y-1.5 relative">
        <Label className="text-sm">Space</Label>
        {row.selectedSpace ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <span className="font-medium text-gray-900">{row.selectedSpace.name}</span>
            <span className="text-xs text-gray-600">{row.selectedSpace.school ?? '—'}</span>
            <span className="text-xs font-mono text-gray-500 break-all">{row.selectedSpace.id}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto h-7"
              onClick={() =>
                onPatch(row.id, {
                  selectedSpace: null,
                  spaceQuery: '',
                  spaceResults: [],
                  spaceMenuOpen: false,
                })
              }
            >
              Change
            </Button>
          </div>
        ) : (
          <>
            <Input
              value={row.spaceQuery}
              onChange={(e) => {
                const v = e.target.value;
                onPatch(row.id, { spaceQuery: v, spaceMenuOpen: v.trim().length >= 2 });
              }}
              onFocus={() => {
                if (row.spaceResults.length > 0) onPatch(row.id, { spaceMenuOpen: true });
              }}
              onBlur={() => {
                setTimeout(() => onPatch(row.id, { spaceMenuOpen: false }), 180);
              }}
              placeholder="Search space by name, school, or slug…"
              autoComplete="off"
            />
            {row.spaceLoading ? (
              <div className="absolute right-3 top-9 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : null}
            {row.spaceMenuOpen && row.spaceResults.length > 0 ? (
              <ul
                className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
                role="listbox"
              >
                {row.spaceResults.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-gray-100"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() =>
                        onPatch(row.id, {
                          selectedSpace: s,
                          spaceQuery: '',
                          spaceResults: [],
                          spaceMenuOpen: false,
                        })
                      }
                    >
                      <span className="font-medium text-gray-900">{s.name}</span>
                      <span className="text-xs text-gray-600">
                        {s.school ?? '—'} · {s.slug ?? '—'}
                      </span>
                      <span className="text-[10px] font-mono text-gray-400 break-all">{s.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!row.spaceLoading && debouncedSpaceQ.length >= 2 && row.spaceResults.length === 0 && !row.spaceMenuOpen ? (
              <p className="text-xs text-gray-500">No spaces match that search.</p>
            ) : null}
          </>
        )}
        <div className="space-y-1 pt-1">
          <Label htmlFor={`space-manual-${row.id}`} className="text-xs text-gray-500 font-normal">
            Or paste space UUID (optional if you picked a space above)
          </Label>
          <Input
            id={`space-manual-${row.id}`}
            value={row.spaceIdManual}
            onChange={(e) => onPatch(row.id, { spaceIdManual: e.target.value })}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="font-mono text-xs"
          />
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-amber-200/90 bg-amber-50/50 p-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={row.isPrimary}
            onChange={(e) => onPatch(row.id, { isPrimary: e.target.checked })}
            className="mt-1 rounded border-gray-300"
          />
          <span>
            <span className="font-medium text-gray-900">Set as home space (primary membership)</span>
            <span className="mt-1 block text-xs leading-relaxed text-gray-600">
              Marks this row as the member’s only <code className="rounded bg-white/80 px-1">is_primary</code>{' '}
              space and updates their profile <code className="rounded bg-white/80 px-1">chapter_id</code> and{' '}
              <code className="rounded bg-white/80 px-1">chapter</code> label to this space (same idea as invite /
              approval “first chapter”). Does <strong>not</strong> change <code className="rounded bg-white/80 px-1">profiles.role</code>.
            </span>
          </span>
        </label>

        {row.isPrimary && row.selectedUser ? (
          <div className="space-y-2 border-t border-amber-200/80 pt-2">
            {row.homeSpaceLookupLoading ? (
              <p className="flex items-center gap-2 text-xs text-gray-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                Checking current home space on their profile…
              </p>
            ) : !targetSpaceId ? (
              <p className="text-xs font-medium text-amber-900" role="status">
                Choose or paste a target space first — we need a space before we can describe the home change.
              </p>
            ) : row.homeSpaceChapterId && row.homeSpaceChapterId !== targetSpaceId ? (
              <div
                className="rounded border border-amber-400 bg-amber-100/80 px-3 py-2 text-xs text-amber-950"
                role="alert"
              >
                <p className="font-semibold">Home chapter will change</p>
                <p className="mt-1 leading-relaxed">
                  This account’s home is currently{' '}
                  <strong>
                    {row.homeSpaceChapterDisplay?.trim() ||
                      (row.homeSpaceChapterId ? `${row.homeSpaceChapterId.slice(0, 8)}…` : 'another space')}
                  </strong>
                  . Saving will move their home to <strong>{newHomeLabel}</strong> and clear primary flags on their
                  other memberships.
                </p>
              </div>
            ) : row.homeSpaceChapterId === targetSpaceId ? (
              <p className="text-xs text-gray-700" role="status">
                This space already matches their profile home (<code className="text-[10px]">chapter_id</code>).
                Saving still refreshes primary flags on other memberships.
              </p>
            ) : (
              <p className="text-xs text-gray-700" role="status">
                They do not have a home chapter on their profile yet. Saving will set{' '}
                <code className="text-[10px]">chapter_id</code> to this space and store its display name on{' '}
                <code className="text-[10px]">chapter</code>.
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={!canSubmitOne || oneLoading} onClick={() => onAssignOne(row.id)}>
          {oneLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign this row'}
        </Button>
        {row.rowMessage ? (
          <span className={cn('text-xs', row.rowMessage.startsWith('OK') ? 'text-green-700' : 'text-red-600')}>
            {row.rowMessage}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DeveloperSeedSpacesContent() {
  const router = useRouter();
  const { profile, isDeveloper } = useProfile();
  const { session } = useAuth();
  const token = session?.access_token;

  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DeveloperSpaceSearchResult[]>([]);

  const [ensureName, setEnsureName] = useState('');
  const [ensureCategory, setEnsureCategory] = useState('');
  const [ensureLoading, setEnsureLoading] = useState(false);
  const [ensureJson, setEnsureJson] = useState<string | null>(null);

  const [assignRows, setAssignRows] = useState<MembershipRow[]>(() => [newRow()]);
  const [assignBulkLoading, setAssignBulkLoading] = useState(false);
  const [assignJson, setAssignJson] = useState<string | null>(null);
  const [oneRowLoadingId, setOneRowLoadingId] = useState<string | null>(null);

  const patchRow = useCallback((id: string, partial: Partial<MembershipRow>) => {
    setAssignRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...partial } : r)));
  }, []);

  const addAssignRow = useCallback(() => {
    setAssignRows((prev) => [...prev, newRow()]);
  }, []);

  const removeAssignRow = useCallback((id: string) => {
    setAssignRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }, []);

  useEffect(() => {
    if (profile && !isDeveloper) {
      toast.error('Access denied. Developer access required.');
      router.push('/dashboard');
    }
  }, [profile, isDeveloper, router]);

  const runSearch = async () => {
    if (!token) {
      toast.error('Sign in required');
      return;
    }
    if (q.trim().length < 2) {
      toast.warn('Enter at least 2 characters');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(
        `/api/developer/spaces/search?q=${encodeURIComponent(q.trim())}&limit=30`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (r.status === 403) {
        toast.error('Forbidden — developer access required');
        return;
      }
      if (!r.ok) {
        toast.error((await r.text()) || 'Search failed');
        return;
      }
      const j = (await r.json()) as { spaces?: DeveloperSpaceSearchResult[] };
      setResults(j.spaces ?? []);
    } finally {
      setLoading(false);
    }
  };

  const runEnsure = async () => {
    if (!token) {
      toast.error('Sign in required');
      return;
    }
    if (!ensureName.trim()) {
      toast.warn('Name required');
      return;
    }
    setEnsureLoading(true);
    setEnsureJson(null);
    try {
      const r = await fetch('/api/developer/spaces/ensure-reference', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: ensureName.trim(),
          category: ensureCategory.trim() || undefined,
        }),
      });
      const j: unknown = await r.json().catch(() => ({}));
      setEnsureJson(JSON.stringify(j, null, 2));
      if (!r.ok) {
        const err = typeof j === 'object' && j && 'error' in j ? String((j as { error: string }).error) : 'Request failed';
        toast.error(err);
        return;
      }
      const created = typeof j === 'object' && j && 'created' in j && (j as { created: boolean }).created;
      toast.success(created ? 'Space created' : 'Existing space matched');
    } finally {
      setEnsureLoading(false);
    }
  };

  const assignMembershipForRow = useCallback(
    async (row: MembershipRow): Promise<{ ok: boolean; summary: string; json?: unknown }> => {
      if (!token) return { ok: false, summary: 'Not signed in' };
      const uid = row.selectedUser?.id;
      const sid = (row.spaceIdManual.trim() || row.selectedSpace?.id || '').trim();
      if (!uid || !sid) return { ok: false, summary: 'Missing user or space' };

      const r = await fetch('/api/developer/spaces/assign-membership', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: uid,
          space_id: sid,
          is_primary: row.isPrimary,
        }),
      });
      const j: unknown = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err = typeof j === 'object' && j && 'error' in j ? String((j as { error: string }).error) : 'Request failed';
        return { ok: false, summary: err, json: j };
      }
      return { ok: true, summary: 'Saved', json: j };
    },
    [token]
  );

  const runAssignOne = useCallback(
    async (rowId: string) => {
      if (!token) {
        toast.error('Sign in required');
        return;
      }
      const row = assignRows.find((r) => r.id === rowId);
      if (!row) return;

      setOneRowLoadingId(rowId);
      setAssignJson(null);
      patchRow(rowId, { rowMessage: null });
      try {
        const out = await assignMembershipForRow(row);
        if (out.json !== undefined) setAssignJson(JSON.stringify(out.json, null, 2));
        if (out.ok) {
          patchRow(rowId, { rowMessage: 'OK — membership saved' });
          toast.success('Membership saved');
          const hs =
            out.json && typeof out.json === 'object' && 'home_space' in out.json
              ? (out.json as { home_space?: { error?: string; membership_saved?: boolean } }).home_space
              : undefined;
          if (hs && typeof hs === 'object' && 'error' in hs && typeof hs.error === 'string') {
            toast.warn(`Membership saved, but home space sync failed: ${hs.error}`);
          }
          if (
            row.isPrimary &&
            hs &&
            typeof hs === 'object' &&
            'updated' in hs &&
            hs.updated === true &&
            'new_chapter_id' in hs &&
            typeof hs.new_chapter_id === 'string'
          ) {
            patchRow(rowId, {
              homeSpaceChapterId: hs.new_chapter_id,
              homeSpaceChapterDisplay:
                'new_chapter_label' in hs && hs.new_chapter_label != null
                  ? String(hs.new_chapter_label)
                  : null,
            });
          }
        } else {
          patchRow(rowId, { rowMessage: `Error: ${out.summary}` });
          toast.error(out.summary);
        }
      } finally {
        setOneRowLoadingId(null);
      }
    },
    [token, assignRows, assignMembershipForRow, patchRow]
  );

  const runAssignBulk = useCallback(async () => {
    if (!token) {
      toast.error('Sign in required');
      return;
    }
    setAssignBulkLoading(true);
    setAssignJson(null);
    let ok = 0;
    let fail = 0;
    let skip = 0;
    let homeSyncFail = 0;
    let lastJson: unknown;

    try {
      for (const row of assignRows) {
        const uid = row.selectedUser?.id;
        const sid = (row.spaceIdManual.trim() || row.selectedSpace?.id || '').trim();
        if (!uid || !sid) {
          skip += 1;
          patchRow(row.id, { rowMessage: null });
          continue;
        }
        const out = await assignMembershipForRow(row);
        lastJson = out.json;
        if (out.ok) {
          ok += 1;
          patchRow(row.id, { rowMessage: 'OK — membership saved' });
          const hs =
            out.json && typeof out.json === 'object' && 'home_space' in out.json
              ? (out.json as { home_space?: { error?: string } }).home_space
              : undefined;
          if (hs && typeof hs === 'object' && 'error' in hs && typeof hs.error === 'string') {
            homeSyncFail += 1;
          }
          if (
            row.isPrimary &&
            hs &&
            typeof hs === 'object' &&
            'updated' in hs &&
            hs.updated === true &&
            'new_chapter_id' in hs &&
            typeof hs.new_chapter_id === 'string'
          ) {
            patchRow(row.id, {
              homeSpaceChapterId: hs.new_chapter_id,
              homeSpaceChapterDisplay:
                'new_chapter_label' in hs && hs.new_chapter_label != null
                  ? String(hs.new_chapter_label)
                  : null,
            });
          }
        } else {
          fail += 1;
          patchRow(row.id, { rowMessage: `Error: ${out.summary}` });
        }
      }

      if (lastJson !== undefined) setAssignJson(JSON.stringify(lastJson, null, 2));
      if (ok > 0) toast.success(`Assigned ${ok} row(s).`);
      if (homeSyncFail > 0) {
        toast.warn(
          `${homeSyncFail} row(s): membership saved but home space sync failed. Check the last API response for details.`
        );
      }
      if (fail > 0) toast.error(`${fail} row(s) failed.`);
      if (skip > 0 && ok === 0 && fail === 0) toast.warn(`Complete ${skip} row(s) (pick user and space) before assigning.`);
      else if (skip > 0) toast.info(`${skip} incomplete row(s) skipped.`);
    } finally {
      setAssignBulkLoading(false);
    }
  }, [token, assignRows, assignMembershipForRow, patchRow]);

  const readyCount = useMemo(
    () =>
      assignRows.filter((r) => r.selectedUser && (r.spaceIdManual.trim() || r.selectedSpace?.id)).length,
    [assignRows]
  );

  return (
    <DeveloperPortal>
      <div className="max-w-5xl mx-auto p-6 space-y-8 pb-24">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Seed & reference spaces</h1>
          <p className="text-sm text-gray-600 mt-1">
            Developer-only tools for TRA-665 CSV imports. Not used in member onboarding.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5" />
              Search spaces
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="dev-space-q">Query</Label>
                <Input
                  id="dev-space-q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="e.g. Youth on Course"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runSearch();
                  }}
                />
              </div>
              <Button type="button" onClick={() => void runSearch()} disabled={loading} className="sm:mb-0.5">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
              </Button>
            </div>
            <div className="rounded-md border border-gray-200 divide-y max-h-[420px] overflow-y-auto text-sm">
              {results.length === 0 && !loading && (
                <div className="p-4 text-gray-500">No results yet.</div>
              )}
              {results.map((s) => (
                <div key={s.id} className="p-3 grid gap-1 sm:grid-cols-2">
                  <div>
                    <div className="font-medium text-gray-900">{s.name}</div>
                    <div className="text-xs text-gray-500 font-mono break-all">{s.id}</div>
                  </div>
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <div>slug: {s.slug ?? '—'}</div>
                    <div>school: {s.school ?? '—'}</div>
                    <div>type: {s.space_type ?? '—'}</div>
                    {s.icon_display_name ? <div>icon: {s.icon_display_name}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-5 w-5" />
              Ensure reference space
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ensure-name">Display name</Label>
                <Input
                  id="ensure-name"
                  value={ensureName}
                  onChange={(e) => setEnsureName(e.target.value)}
                  placeholder="Exact or new label"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ensure-cat">Category (optional)</Label>
                <Input
                  id="ensure-cat"
                  value={ensureCategory}
                  onChange={(e) => setEnsureCategory(e.target.value)}
                  placeholder="e.g. Other"
                />
              </div>
            </div>
            <Button type="button" onClick={() => void runEnsure()} disabled={ensureLoading}>
              {ensureLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find or create'}
            </Button>
            {ensureJson ? (
              <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-md overflow-x-auto">{ensureJson}</pre>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5" />
              Assign members to spaces
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Search profiles by <strong>name</strong> or <strong>email</strong> (or paste a user UUID). Pick a{' '}
              <strong>space</strong> from live search or paste its UUID. Add multiple rows for bulk assigns; each row
              can be sent individually or processed together. New memberships are created as{' '}
              <strong>active</strong> in the space. Optional “home space” updates <strong>profile home</strong> (
              <code className="text-xs">chapter_id</code> / <code className="text-xs">chapter</code>); it does{' '}
              <strong>not</strong> change <code className="text-xs">profiles.role</code>.
            </p>
            <p className="text-xs text-gray-500">
              Uses <code className="rounded bg-gray-100 px-1">GET /api/developer/users</code> and{' '}
              <code className="rounded bg-gray-100 px-1">/api/developer/spaces/search</code>, then{' '}
              <code className="rounded bg-gray-100 px-1">upsertSpaceMembership</code>.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addAssignRow}>
                <Users className="h-4 w-4 mr-1" />
                Add row
              </Button>
              <Button
                type="button"
                onClick={() => void runAssignBulk()}
                disabled={assignBulkLoading || readyCount === 0}
              >
                {assignBulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Assign all ready rows (${readyCount})`}
              </Button>
            </div>

            <div className="space-y-4">
              {assignRows.map((row) => (
                <MembershipAssignRowEditor
                  key={row.id}
                  token={token ?? null}
                  row={row}
                  onPatch={patchRow}
                  onRemove={removeAssignRow}
                  canRemove={assignRows.length > 1}
                  onAssignOne={(id) => void runAssignOne(id)}
                  oneLoading={oneRowLoadingId === row.id}
                />
              ))}
            </div>

            {assignJson ? (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Last API response</Label>
                <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-md overflow-x-auto">{assignJson}</pre>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DeveloperPortal>
  );
}
