'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NationalOrgDirectoryPick } from '@/lib/utils/chapterNationalOrgMatch';

export type NationalOrgSearchRow = {
  id: string;
  name: string;
  short_name: string | null;
  type: string | null;
};

type NationalOrgSearchComboboxProps = {
  id?: string;
  label: string;
  description?: string;
  value: NationalOrgDirectoryPick | null;
  onChange: (next: NationalOrgDirectoryPick | null) => void;
  disabled?: boolean;
  className?: string;
};

function rowLabel(r: NationalOrgSearchRow): string {
  const sn = r.short_name?.trim();
  const t = r.type?.trim();
  const base = sn ? `${r.name} (${sn})` : r.name;
  return t ? `${base} · ${t}` : base;
}

export function NationalOrgSearchCombobox({
  id,
  label,
  description,
  value,
  onChange,
  disabled = false,
  className,
}: NationalOrgSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<NationalOrgSearchRow[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchHits = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, limit: '30' });
      const res = await fetch(`/api/national-organizations/search?${params}`);
      if (!res.ok) {
        setHits([]);
        return;
      }
      const json = (await res.json()) as { nationalOrganizations?: NationalOrgSearchRow[] };
      setHits(json.nationalOrganizations ?? []);
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

  const selectRow = (row: NationalOrgSearchRow) => {
    onChange({
      id: row.id,
      name: row.name,
      short_name: row.short_name,
    });
    setQuery('');
    setOpen(false);
    setHits([]);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
    setHits([]);
  };

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
            disabled={disabled}
            onClick={() => !disabled && setOpen((o) => !o)}
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-left',
              'focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="truncate text-gray-500">Search national organizations…</span>
          </button>

          {open && !disabled ? (
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
                    Keep typing to search your fraternity, sorority, or umbrella org.
                  </div>
                ) : hits.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">No matches</div>
                ) : (
                  hits.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="w-full border-b border-gray-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-50"
                      onClick={() => selectRow(row)}
                    >
                      <div className="font-medium text-gray-900">{rowLabel(row)}</div>
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
