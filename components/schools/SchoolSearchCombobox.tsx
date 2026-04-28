'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SchoolDirectoryPick } from '@/lib/utils/chapterSchoolMatch';
import type { SchoolSearchHit } from '@/lib/schools/types';

type SchoolSearchComboboxProps = {
  id?: string;
  label: string;
  description?: string;
  /** Required when selecting an OpenAlex preview row (POST /api/schools/materialize). */
  getAuthHeaders: () => Record<string, string>;
  value: SchoolDirectoryPick | null;
  onChange: (next: SchoolDirectoryPick | null) => void;
  disabled?: boolean;
  className?: string;
};

function rowLabel(r: SchoolSearchHit): string {
  const sn = r.short_name?.trim();
  return sn ? `${r.name} (${sn})` : r.name;
}

export function SchoolSearchCombobox({
  id,
  label,
  description,
  getAuthHeaders,
  value,
  onChange,
  disabled = false,
  className,
}: SchoolSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [materializing, setMaterializing] = useState(false);
  const [hits, setHits] = useState<SchoolSearchHit[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchHits = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, limit: '30' });
      const res = await fetch(`/api/schools/search?${params}`);
      if (!res.ok) {
        setHits([]);
        return;
      }
      const json = (await res.json()) as { schools?: SchoolSearchHit[] };
      setHits(json.schools ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      void fetchHits(q);
    }, 280);
    return () => clearTimeout(t);
  }, [query, fetchHits]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selectRow = async (row: SchoolSearchHit) => {
    if (row.source === 'database') {
      onChange({
        id: row.id,
        name: row.name,
        short_name: row.short_name,
      });
      setQuery('');
      setOpen(false);
      setHits([]);
      return;
    }

    if (!row.openAlexId) return;

    setMaterializing(true);
    try {
      const res = await fetch('/api/schools/materialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ openAlexId: row.openAlexId }),
      });
      const json = (await res.json()) as {
        school?: { id: string; name: string; short_name: string | null };
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error || 'Could not save that school. Try again.');
        return;
      }
      if (!json.school) {
        toast.error('Unexpected response from server.');
        return;
      }
      onChange({
        id: json.school.id,
        name: json.school.name,
        short_name: json.school.short_name,
      });
      setQuery('');
      setOpen(false);
      setHits([]);
    } catch {
      toast.error('Network error saving school.');
    } finally {
      setMaterializing(false);
    }
  };

  const clear = () => {
    onChange(null);
    setQuery('');
    setHits([]);
  };

  const busy = disabled || materializing;

  return (
    <div ref={wrapRef} className={cn('space-y-2', className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label htmlFor={id}>{label}</Label>
          {description ? <p className="text-xs text-gray-500 mt-0.5">{description}</p> : null}
        </div>
        {value ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={clear}>
            Clear
          </Button>
        ) : null}
      </div>

      {value ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
          {value.short_name?.trim() ? `${value.name} (${value.short_name})` : value.name}
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            id={id}
            disabled={busy}
            onClick={() => !busy && setOpen((o) => !o)}
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-left',
              'focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary',
              busy && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="truncate text-gray-500">
              {materializing ? 'Saving school…' : 'Search schools…'}
            </span>
          </button>

          {open && !busy ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 flex max-h-72 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
              <div className="shrink-0 border-b border-gray-100 p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type at least 2 characters…"
                    className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 pl-8 pr-8 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    autoFocus
                  />
                  {query ? (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      aria-label="Clear search"
                      onClick={() => setQuery('')}
                    >
                      <X className="h-3.5 w-3.5 text-gray-400" />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <div className="px-3 py-4 text-sm text-gray-500">Loading…</div>
                ) : query.trim().length < 2 ? (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                    Keep typing to search local and global directories.
                  </div>
                ) : hits.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">No matches</div>
                ) : (
                  hits.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="w-full border-b border-gray-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-50"
                      onClick={() => void selectRow(row)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-gray-900">{rowLabel(row)}</div>
                          {row.location?.trim() ? (
                            <div className="text-xs text-gray-500">{row.location}</div>
                          ) : null}
                        </div>
                        {row.source === 'openalex' ? (
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                            Directory
                          </span>
                        ) : (
                          <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-800">
                            Saved
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
