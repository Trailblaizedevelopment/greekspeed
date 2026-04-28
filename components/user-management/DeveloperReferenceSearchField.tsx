'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown } from 'lucide-react';
import { toast } from 'react-toastify';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FieldHint } from './FieldHint';

type SchoolRow = {
  id: string;
  name: string;
  short_name: string | null;
  location: string | null;
  domain?: string | null;
  source?: 'database' | 'openalex';
  openAlexId?: string;
};

type OrgRow = {
  id: string;
  name: string;
  short_name: string | null;
  type: string | null;
};

export type DeveloperReferenceSelection =
  | { kind: 'school'; id: string; label: string; row: SchoolRow }
  | { kind: 'national_organization'; id: string; label: string; row: OrgRow };

interface DeveloperReferenceSearchFieldProps {
  label: string;
  /** One-sentence hover help next to the label. */
  labelHint?: string;
  description?: string;
  kind: 'schools' | 'national-organizations';
  accessToken: string | undefined;
  value: DeveloperReferenceSelection | null;
  onChange: (next: DeveloperReferenceSelection | null) => void;
  disabled?: boolean;
}

function schoolLabel(r: SchoolRow): string {
  const sn = r.short_name?.trim();
  return sn ? `${r.name} (${sn})` : r.name;
}

function orgLabel(r: OrgRow): string {
  const t = r.type?.trim();
  return t ? `${r.name} · ${t}` : r.name;
}

export function DeveloperReferenceSearchField({
  label,
  labelHint,
  description,
  kind,
  accessToken,
  value,
  onChange,
  disabled = false,
}: DeveloperReferenceSearchFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [schoolHits, setSchoolHits] = useState<SchoolRow[]>([]);
  const [orgHits, setOrgHits] = useState<OrgRow[]>([]);
  const [mounted, setMounted] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);

  const endpoint =
    kind === 'schools'
      ? '/api/schools/search'
      : '/api/developer/reference/national-organizations';

  const fetchHits = useCallback(
    async (q: string) => {
      if (kind === 'national-organizations' && !accessToken) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({ q, limit: '30' });
        const res = await fetch(`${endpoint}?${params}`, {
          headers:
            kind === 'schools'
              ? {}
              : { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { schools?: SchoolRow[]; nationalOrganizations?: OrgRow[] };
        if (kind === 'schools') setSchoolHits(json.schools ?? []);
        else setOrgHits(json.nationalOrganizations ?? []);
      } finally {
        setLoading(false);
      }
    },
    [accessToken, endpoint, kind],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void fetchHits(query.trim());
    }, 280);
    return () => clearTimeout(t);
  }, [open, query, fetchHits]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setRect(null);
      return;
    }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const margin = 8;
      const maxH = Math.min(320, Math.max(120, window.innerHeight - r.bottom - margin * 2));
      setRect({
        top: r.bottom + 4,
        left: r.left,
        width: Math.max(280, r.width),
        maxH,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const hits: (SchoolRow | OrgRow)[] = kind === 'schools' ? schoolHits : orgHits;

  const selectSchool = async (row: SchoolRow) => {
    if (row.source === 'openalex' && row.openAlexId) {
      if (!accessToken) {
        toast.error('Sign in to link a school from the global directory.');
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/schools/materialize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ openAlexId: row.openAlexId }),
        });
        const json = (await res.json()) as {
          school?: { id: string; name: string; short_name: string | null; location: string | null; domain?: string | null };
          error?: string;
        };
        if (!res.ok) {
          toast.error(json.error || 'Could not save school');
          return;
        }
        if (!json.school) {
          toast.error('Unexpected response from server.');
          return;
        }
        const saved: SchoolRow = {
          id: json.school.id,
          name: json.school.name,
          short_name: json.school.short_name,
          location: json.school.location,
          domain: json.school.domain ?? null,
          source: 'database',
        };
        onChange({ kind: 'school', id: saved.id, label: schoolLabel(saved), row: saved });
      } finally {
        setLoading(false);
      }
    } else {
      onChange({ kind: 'school', id: row.id, label: schoolLabel(row), row });
    }
    setOpen(false);
    setQuery('');
  };

  const selectOrg = (row: OrgRow) => {
    onChange({ kind: 'national_organization', id: row.id, label: orgLabel(row), row });
    setOpen(false);
    setQuery('');
  };

  const orgsNeedToken = kind === 'national-organizations' && !accessToken;

  return (
    <div ref={wrapRef} className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1">
            <Label>{label}</Label>
            {labelHint ? <FieldHint text={labelHint} /> : null}
          </div>
          {description ? <p className="text-xs text-gray-500 mt-0.5">{description}</p> : null}
        </div>
        {value ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => onChange(null)}>
            Clear link
          </Button>
        ) : null}
      </div>

      {orgsNeedToken ? (
        <p className="text-xs text-amber-700">Sign in as a developer to search national organizations.</p>
      ) : kind === 'schools' && !accessToken ? (
        <p className="text-xs text-gray-600">
          School search works without signing in; sign in to link a directory-only campus (saves it to your database).
        </p>
      ) : null}

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled || orgsNeedToken}
          onClick={() => !orgsNeedToken && setOpen((o) => !o)}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm',
            'focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary',
            (disabled || orgsNeedToken) && 'opacity-50 cursor-not-allowed'
          )}
        >
          <span className={cn('truncate text-left', !value && 'text-gray-500')}>
            {value ? value.label : kind === 'schools' ? 'Search schools…' : 'Search national organizations…'}
          </span>
          <ChevronDown className={cn('h-4 w-4 text-gray-400 shrink-0', open && 'rotate-180')} />
        </button>

        {mounted &&
          open &&
          rect &&
          createPortal(
            <div
              ref={panelRef}
              className="fixed z-[100220] flex flex-col rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden"
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                maxHeight: rect.maxH,
              }}
            >
              <div className="shrink-0 p-2 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type to search…"
                    className="w-full h-8 pl-8 pr-8 text-sm rounded-md border border-gray-200 bg-gray-50 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                    autoFocus
                  />
                  {query ? (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
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
                ) : hits.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-gray-500 text-center">No matches</div>
                ) : (
                  hits.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      onClick={() =>
                        kind === 'schools'
                          ? void selectSchool(row as SchoolRow)
                          : selectOrg(row as OrgRow)
                      }
                    >
                      {kind === 'schools' ? schoolLabel(row as SchoolRow) : orgLabel(row as OrgRow)}
                    </button>
                  ))
                )}
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}
