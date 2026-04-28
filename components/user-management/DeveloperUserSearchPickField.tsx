'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { FieldHint } from '@/components/user-management/FieldHint';
import { cn } from '@/lib/utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DeveloperUserPick = { id: string; email: string | null; full_name: string | null };

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function displayUser(u: DeveloperUserPick): string {
  const name = (u.full_name || '').trim() || 'No name';
  const em = (u.email || '').trim();
  return em ? `${name} · ${em}` : name;
}

type SuggestPlacement = {
  left: number;
  width: number;
  maxHeight: number;
  placement: 'above' | 'below';
  top?: number;
  bottom?: number;
};

type DeveloperUserSearchPickFieldProps = {
  label: string;
  labelHint?: string;
  description?: string;
  accessToken: string | undefined;
  value: DeveloperUserPick | null;
  onChange: (next: DeveloperUserPick | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function DeveloperUserSearchPickField({
  label,
  labelHint,
  description,
  accessToken,
  value,
  onChange,
  disabled = false,
  placeholder = 'Search by name, email, or paste user UUID…',
}: DeveloperUserSearchPickFieldProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<DeveloperUserPick[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [suggestBox, setSuggestBox] = useState<SuggestPlacement | null>(null);

  const debouncedUserQ = useDebouncedValue(userQuery.trim(), 320);

  useEffect(() => {
    if (!accessToken || value) return;
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
          const j = (await r.json()) as { user?: DeveloperUserPick };
          const u = j.user;
          const pick: DeveloperUserPick[] =
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
        const r = await fetch(`/api/developer/users?q=${encodeURIComponent(q)}&limit=12&page=1`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (cancelled) return;
        if (!r.ok) {
          setUserResults([]);
          setUserLoading(false);
          setUserMenuOpen(false);
          return;
        }
        const j = (await r.json()) as { users?: DeveloperUserPick[] };
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
  }, [accessToken, debouncedUserQ, value]);

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

  const locked = disabled || !accessToken;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm">{label}</Label>
        {labelHint ? <FieldHint text={labelHint} /> : null}
      </div>
      {description ? <p className="text-xs text-gray-600">{description}</p> : null}
      {!accessToken ? (
        <p className="text-xs text-gray-500">Sign in to search users.</p>
      ) : value ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
          <span className="text-gray-900">{displayUser(value)}</span>
          <span className="text-xs font-mono text-gray-500 break-all">{value.id}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-7"
            disabled={locked}
            onClick={() => {
              onChange(null);
              setUserQuery('');
              setUserResults([]);
              setUserMenuOpen(false);
            }}
          >
            Clear
          </Button>
        </div>
      ) : (
        <>
          <div ref={anchorRef} className="relative">
            <Input
              value={userQuery}
              disabled={locked}
              onChange={(e) => {
                const v = e.target.value;
                setUserQuery(v);
                setUserMenuOpen(v.trim().length >= 2);
              }}
              onFocus={() => {
                if (userResults.length > 0) setUserMenuOpen(true);
              }}
              onBlur={() => setTimeout(() => setUserMenuOpen(false), 180)}
              placeholder={placeholder}
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
                  className="fixed z-[100200] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
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
                          onChange(u);
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
      <p className={cn('text-xs text-gray-500', locked && 'opacity-70')}>
        Optional. This user is added as an active member and set as the only Space Icon for the new space.
      </p>
    </div>
  );
}
