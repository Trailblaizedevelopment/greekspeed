'use client';

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/supabase/auth-context';

export type DeveloperSpaceOption = {
  id: string;
  name: string;
  school: string | null;
};

const DEBOUNCE_MS = 350;
const PAGE_LIMIT = 80;

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function mapRow(r: Record<string, unknown>): DeveloperSpaceOption {
  return {
    id: String(r.id),
    name: typeof r.name === 'string' ? r.name : '',
    school: typeof r.school === 'string' ? r.school : null,
  };
}

interface DeveloperSpaceSelectComboboxProps {
  value: string;
  /** Display name for the current value (set when user picks a row). */
  selectedLabel: string;
  onValueChange: (spaceId: string, spaceName: string) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Searchable space picker for developer flows. Uses GET /api/developer/chapters with optional `q`
 * (debounced) plus a recent-first browse when the query is empty.
 */
export function DeveloperSpaceSelectCombobox({
  value,
  selectedLabel,
  onValueChange,
  disabled,
  id,
}: DeveloperSpaceSelectComboboxProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const [rows, setRows] = useState<DeveloperSpaceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverWidth, setPopoverWidth] = useState<number | null>(null);

  const syncPopoverWidth = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    setPopoverWidth(el.getBoundingClientRect().width);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    syncPopoverWidth();
    const onResize = () => syncPopoverWidth();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, syncPopoverWidth]);

  const fetchList = useCallback(
    async (q: string, signal: AbortSignal) => {
      if (!token) return;
      const params = new URLSearchParams({ page: '1', limit: String(PAGE_LIMIT) });
      if (q) params.set('q', q);
      const res = await fetch(`/api/developer/chapters?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!res.ok) throw new Error('Failed to load spaces');
      const data = await res.json();
      const raw = (data.chapters || []) as Record<string, unknown>[];
      if (!signal.aborted) setRows(raw.map(mapRow));
    },
    [token]
  );

  useEffect(() => {
    if (!open || !token) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    void (async () => {
      try {
        await fetchList(debouncedQuery, ac.signal);
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error('DeveloperSpaceSelectCombobox:', e);
        if (!ac.signal.aborted) setRows([]);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [open, token, debouncedQuery, fetchList]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const triggerText = value
    ? selectedLabel.trim() || 'Selected space'
    : 'Select a chapter';

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className="w-full min-w-0">
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || !token}
            className={cn(
              'h-10 w-full min-w-0 justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm font-normal text-gray-900 shadow-sm hover:bg-gray-50',
              !value && 'text-gray-500'
            )}
          >
            <span className="truncate">{triggerText}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            'z-[100050] min-w-[280px] border border-gray-200 bg-white p-0 text-gray-900 shadow-xl',
            'rounded-md overflow-hidden'
          )}
          align="start"
          side="bottom"
          sideOffset={4}
          collisionPadding={12}
          style={
            popoverWidth != null
              ? { width: popoverWidth, minWidth: popoverWidth, maxWidth: 'min(100vw - 2rem, 560px)' }
              : undefined
          }
        >
          <div className="flex items-center border-b border-gray-200 bg-white px-2 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
            <Input
              ref={searchInputRef}
              className="h-8 min-w-0 flex-1 border-0 bg-white p-0 text-sm text-gray-900 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder="Search name, slug, school, chapter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[min(280px,40vh)] overflow-y-auto bg-white p-1">
            {loading ? (
              <p className="px-2 py-6 text-center text-sm text-gray-500">Loading spaces…</p>
            ) : rows.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-gray-500">
                {debouncedQuery ? 'No matching spaces.' : 'No spaces returned.'}
              </p>
            ) : (
              rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={cn(
                    'flex w-full flex-col items-stretch rounded-sm px-2 py-2 text-left text-sm text-gray-900 hover:bg-gray-100',
                    value === row.id && 'bg-brand-primary/10 text-brand-primary'
                  )}
                  onClick={() => {
                    onValueChange(row.id, row.name);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <span className="truncate font-medium leading-snug">{row.name}</span>
                  {row.school ? (
                    <span className="truncate text-xs text-gray-500">{row.school}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </div>
    </Popover>
  );
}
