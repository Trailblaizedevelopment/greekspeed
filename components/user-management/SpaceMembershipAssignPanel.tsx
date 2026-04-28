'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DevUserPick = { id: string; email: string | null; full_name: string | null };

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function displayUser(u: DevUserPick): string {
  const name = (u.full_name || '').trim() || 'No name';
  const em = (u.email || '').trim();
  return em ? `${name} · ${em}` : name;
}

type SpaceMembershipAssignPanelProps = {
  accessToken: string;
  spaceId: string;
  onAssigned?: () => void;
};

type MemberSuggestPlacement = {
  left: number;
  width: number;
  maxHeight: number;
  placement: 'above' | 'below';
  top?: number;
  bottom?: number;
};

export function SpaceMembershipAssignPanel({ accessToken, spaceId, onAssigned }: SpaceMembershipAssignPanelProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<DevUserPick[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [suggestBox, setSuggestBox] = useState<MemberSuggestPlacement | null>(null);
  const [selectedUser, setSelectedUser] = useState<DevUserPick | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [homeSpaceLookupLoading, setHomeSpaceLookupLoading] = useState(false);
  const [homeSpaceChapterId, setHomeSpaceChapterId] = useState<string | null>(null);
  const [homeSpaceChapterDisplay, setHomeSpaceChapterDisplay] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [rowMessage, setRowMessage] = useState<string | null>(null);

  const debouncedUserQ = useDebouncedValue(userQuery.trim(), 320);

  useEffect(() => {
    if (!selectedUser || !isPrimary) {
      setHomeSpaceLookupLoading(false);
      setHomeSpaceChapterId(null);
      setHomeSpaceChapterDisplay(null);
      return;
    }
    let cancelled = false;
    setHomeSpaceLookupLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/developer/users?userId=${encodeURIComponent(selectedUser.id)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (cancelled) return;
        if (!r.ok) {
          setHomeSpaceChapterId(null);
          setHomeSpaceChapterDisplay(null);
          return;
        }
        const j = (await r.json()) as { user?: { chapter_id?: string | null; chapter?: string | null } };
        const u = j.user;
        setHomeSpaceChapterId((u?.chapter_id as string | undefined) ?? null);
        setHomeSpaceChapterDisplay((u?.chapter as string | undefined) ?? null);
      } finally {
        if (!cancelled) setHomeSpaceLookupLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUser?.id, isPrimary, accessToken]);

  useEffect(() => {
    if (!accessToken || selectedUser) return;
    const q = debouncedUserQ;
    if (q.length < 2) {
      if (userResults.length > 0 || userLoading || userMenuOpen) {
        setUserResults([]);
        setUserLoading(false);
        setUserMenuOpen(false);
      }
      return;
    }
    let cancelled = false;
    setUserLoading(true);
    (async () => {
      try {
        if (UUID_RE.test(q)) {
          const r = await fetch(`/api/developer/users?userId=${encodeURIComponent(q)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (cancelled) return;
          if (!r.ok) {
            setUserResults([]);
            setUserLoading(false);
            setUserMenuOpen(true);
            return;
          }
          const j = (await r.json()) as { user?: DevUserPick };
          const u = j.user;
          const pick: DevUserPick[] =
            u?.id && typeof u.id === 'string'
              ? [
                  {
                    id: u.id,
                    email: (u as { email?: string | null }).email ?? null,
                    full_name: (u as { full_name?: string | null }).full_name ?? null,
                  },
                ]
              : [];
          setUserResults(pick);
          setUserLoading(false);
          setUserMenuOpen(pick.length > 0);
          return;
        }
        const r = await fetch(
          `/api/developer/users?q=${encodeURIComponent(q)}&limit=12&page=1`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (cancelled) return;
        if (!r.ok) {
          setUserResults([]);
          setUserLoading(false);
          setUserMenuOpen(false);
          return;
        }
        const j = (await r.json()) as { users?: DevUserPick[] };
        const list = (j.users ?? []).map((u) => ({
          id: u.id,
          email: u.email ?? null,
          full_name: u.full_name ?? null,
        }));
        setUserResults(list);
        setUserLoading(false);
        setUserMenuOpen(list.length > 0);
      } catch {
        if (!cancelled) {
          setUserResults([]);
          setUserLoading(false);
          setUserMenuOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, debouncedUserQ, selectedUser]);

  const updateSuggestPosition = useCallback(() => {
    if (!userMenuOpen || userResults.length === 0 || !anchorRef.current) {
      setSuggestBox(null);
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    const gap = 6;
    const listMax = 260;
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom - gap - 12;
    const spaceAbove = rect.top - gap - 12;
    const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
    if (openUp) {
      setSuggestBox({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(listMax, Math.max(120, spaceAbove)),
        placement: 'above',
        bottom: viewportH - rect.top + gap,
      });
    } else {
      setSuggestBox({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(listMax, Math.max(120, spaceBelow)),
        placement: 'below',
        top: rect.bottom + gap,
      });
    }
  }, [userMenuOpen, userResults.length]);

  useLayoutEffect(() => {
    updateSuggestPosition();
    if (!userMenuOpen || userResults.length === 0) return;
    window.addEventListener('resize', updateSuggestPosition);
    window.addEventListener('scroll', updateSuggestPosition, true);
    return () => {
      window.removeEventListener('resize', updateSuggestPosition);
      window.removeEventListener('scroll', updateSuggestPosition, true);
    };
  }, [userMenuOpen, userResults, updateSuggestPosition]);

  const runAssign = useCallback(async () => {
    if (!selectedUser) {
      toast.warn('Select a member');
      return;
    }
    setAssignLoading(true);
    setRowMessage(null);
    try {
      const r = await fetch('/api/developer/spaces/assign-membership', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: selectedUser.id,
          space_id: spaceId,
          is_primary: isPrimary,
        }),
      });
      const j: unknown = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err = typeof j === 'object' && j && 'error' in j ? String((j as { error: string }).error) : 'Request failed';
        setRowMessage(`Error: ${err}`);
        toast.error(err);
        return;
      }
      setRowMessage('OK — membership saved');
      toast.success('Membership saved');
      const hs =
        j && typeof j === 'object' && 'home_space' in j
          ? (j as { home_space?: { error?: string; updated?: boolean; new_chapter_id?: string; new_chapter_label?: unknown } }).home_space
          : undefined;
      if (hs && typeof hs === 'object' && 'error' in hs && typeof hs.error === 'string') {
        toast.warn(`Membership saved, but home space sync failed: ${hs.error}`);
      }
      if (
        isPrimary &&
        hs &&
        typeof hs === 'object' &&
        hs.updated === true &&
        typeof hs.new_chapter_id === 'string'
      ) {
        setHomeSpaceChapterId(hs.new_chapter_id);
        setHomeSpaceChapterDisplay(
          'new_chapter_label' in hs && hs.new_chapter_label != null ? String(hs.new_chapter_label) : null
        );
      }
      onAssigned?.();
    } finally {
      setAssignLoading(false);
    }
  }, [accessToken, spaceId, selectedUser, isPrimary, onAssigned]);

  const targetSpaceId = spaceId.trim();

  return (
    <div className="space-y-4">
      <div className="relative space-y-1.5">
        <Label className="text-sm">Member</Label>
        {selectedUser ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <span className="text-gray-900">{displayUser(selectedUser)}</span>
            <span className="text-xs font-mono text-gray-500 break-all">{selectedUser.id}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto h-7"
              onClick={() => {
                setSelectedUser(null);
                setUserQuery('');
                setUserResults([]);
                setUserMenuOpen(false);
                setHomeSpaceChapterId(null);
                setHomeSpaceChapterDisplay(null);
              }}
            >
              Change
            </Button>
          </div>
        ) : (
          <>
            <div ref={anchorRef} className="relative">
              <Input
                value={userQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  setUserQuery(v);
                  setUserMenuOpen(v.trim().length >= 2);
                }}
                onFocus={() => {
                  if (userResults.length > 0) setUserMenuOpen(true);
                }}
                onBlur={() => setTimeout(() => setUserMenuOpen(false), 180)}
                placeholder="Search by name, email, or paste user UUID…"
                autoComplete="off"
              />
              {userLoading ? (
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : null}
            </div>
            {typeof document !== 'undefined' &&
            userMenuOpen &&
            userResults.length > 0 &&
            suggestBox
              ? createPortal(
                  <ul
                    data-trailblaize-dropdown-portal
                    className="fixed z-[10001] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
                    style={{
                      left: suggestBox.left,
                      width: suggestBox.width,
                      maxHeight: suggestBox.maxHeight,
                      ...(suggestBox.placement === 'below'
                        ? { top: suggestBox.top }
                        : { bottom: suggestBox.bottom }),
                    }}
                  >
                    {userResults.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-gray-100"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSelectedUser(u);
                            setUserQuery('');
                            setUserResults([]);
                            setUserMenuOpen(false);
                            setSuggestBox(null);
                            setUserLoading(false);
                          }}
                        >
                          <span className="font-medium text-gray-900">{(u.full_name || '').trim() || '—'}</span>
                          <span className="text-xs text-gray-600">{u.email || '—'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>,
                  document.body
                )
              : null}
          </>
        )}
      </div>

      <div className="space-y-2 rounded-md border border-amber-200/90 bg-amber-50/50 p-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="mt-1 rounded border-gray-300"
          />
          <span>
            <span className="font-medium text-gray-900">Set as home space (primary membership)</span>
            <span className="mt-1 block text-xs text-gray-600">
              Updates <code className="rounded bg-white/80 px-1 text-[10px]">chapter_id</code> /{' '}
              <code className="rounded bg-white/80 px-1 text-[10px]">chapter</code> when saved; clears other primary
              memberships.
            </span>
          </span>
        </label>
        {isPrimary && selectedUser ? (
          <div className="border-t border-amber-200/80 pt-2 text-xs text-gray-700">
            {homeSpaceLookupLoading ? (
              <p className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking current home…
              </p>
            ) : homeSpaceChapterId && homeSpaceChapterId !== targetSpaceId ? (
              <p className="text-amber-950">
                <strong>Home will change</strong> from{' '}
                {homeSpaceChapterDisplay?.trim() || `${homeSpaceChapterId.slice(0, 8)}…`} to this space.
              </p>
            ) : homeSpaceChapterId === targetSpaceId ? (
              <p>Profile home already points at this space.</p>
            ) : (
              <p>No home set yet; this assignment will set it.</p>
            )}
          </div>
        ) : null}
      </div>

      <Button
        type="button"
        disabled={!selectedUser || assignLoading}
        onClick={() => void runAssign()}
        className="rounded-full"
      >
        {assignLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign to this space'}
      </Button>
      {rowMessage ? (
        <span className={cn('text-xs', rowMessage.startsWith('OK') ? 'text-green-700' : 'text-red-600')}>
          {rowMessage}
        </span>
      ) : null}
    </div>
  );
}
