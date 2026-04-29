'use client';

import { useCallback, useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getSpaceTypeLabel } from '@/lib/spaceTypeTaxonomy';
import { Loader2, Building2, MapPin, GraduationCap, Landmark, Globe2, Hash, X } from 'lucide-react';

type LinkedSchool = {
  id: string;
  name: string;
  short_name: string | null;
  location: string | null;
};

type LinkedNationalOrg = {
  id: string;
  name: string;
  short_name: string | null;
};

type SpaceRow = Record<string, unknown>;

function str(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

function optionalStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function DetailBlock({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  const v = value?.trim();
  if (!v) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-sm text-gray-900 ${mono ? 'font-mono text-xs break-all' : ''}`}>{v}</p>
    </div>
  );
}

export type ViewChapterSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Space to load; `name` seeds the title until fetch completes */
  chapter: { id: string; name?: string };
  accessToken: string | undefined;
};

export function ViewChapterSheet({ open, onOpenChange, chapter, accessToken }: ViewChapterSheetProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [space, setSpace] = useState<SpaceRow | null>(null);
  const [linkedSchool, setLinkedSchool] = useState<LinkedSchool | null>(null);
  const [linkedOrg, setLinkedOrg] = useState<LinkedNationalOrg | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const load = useCallback(async () => {
    if (!chapter.id || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/developer/spaces/${chapter.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const j = (await r.json()) as {
        error?: string;
        space?: SpaceRow;
        linked_school?: LinkedSchool | null;
        linked_national_organization?: LinkedNationalOrg | null;
      };
      if (!r.ok) {
        setError(j.error || 'Failed to load space');
        setSpace(null);
        setLinkedSchool(null);
        setLinkedOrg(null);
        return;
      }
      setSpace(j.space ?? null);
      setLinkedSchool(j.linked_school ?? null);
      setLinkedOrg(j.linked_national_organization ?? null);
    } catch {
      setError('Failed to load space');
      setSpace(null);
      setLinkedSchool(null);
      setLinkedOrg(null);
    } finally {
      setLoading(false);
    }
  }, [chapter.id, accessToken]);

  useEffect(() => {
    if (!open || !chapter.id) return;
    if (!accessToken) {
      setError('Sign in required to view chapter details.');
      return;
    }
    void load();
  }, [open, chapter.id, accessToken, load]);

  useEffect(() => {
    if (!open) {
      setSpace(null);
      setLinkedSchool(null);
      setLinkedOrg(null);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const name = str(space?.name) || chapter.name || 'Space';
  const status = optionalStr(space?.chapter_status) ?? '—';
  const description = optionalStr(space?.description);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom" modal dismissible>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/40 transition-opacity" />
        <Drawer.Content
          className={cn(
            'bg-white flex flex-col z-[10000] fixed bottom-0 left-0 right-0 shadow-2xl border border-gray-200 outline-none',
            isMobile
              ? 'max-h-[85dvh] rounded-t-[20px]'
              : 'max-h-[80vh] max-w-lg mx-auto rounded-t-[20px]'
          )}
        >
          {isMobile ? (
            <div
              className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mt-3 mb-1"
              aria-hidden
            />
          ) : null}

          <div className="flex flex-col flex-1 min-h-0 max-h-[inherit]">
            <div className="flex items-start justify-between gap-3 px-4 pt-2 sm:pt-4 pb-3 border-b border-gray-100 shrink-0">
              <div className="flex-1 min-w-0 text-left space-y-1 pr-2">
                <Drawer.Title className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-brand-accent shrink-0" />
                  Chapter details
                </Drawer.Title>
                <Drawer.Description className="text-sm font-medium text-gray-900 leading-snug">
                  {name}
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

            <div
              className={cn(
                'flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5',
                isMobile && 'pb-[calc(1rem+env(safe-area-inset-bottom))]'
              )}
            >
            {!accessToken ? (
              <p className="text-sm text-gray-600">Sign in to load this space.</p>
            ) : loading ? (
              <div className="flex justify-center py-12 text-gray-500">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : space ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={status === 'active' ? 'default' : 'secondary'} className="capitalize text-xs">
                    {status}
                  </Badge>
                  <span className="text-sm text-gray-600 tabular-nums">
                    {str(space.member_count)} members · founded {str(space.founded_year ?? '—')}
                  </span>
                </div>

                <section className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    Identity
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailBlock label="Chapter designation" value={optionalStr(space.chapter_name) ?? undefined} />
                    <DetailBlock label="Slug" value={optionalStr(space.slug) ?? undefined} mono />
                    <DetailBlock
                      label="Space type"
                      value={
                        optionalStr(space.space_type)
                          ? getSpaceTypeLabel(optionalStr(space.space_type) ?? '')
                          : undefined
                      }
                    />
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Location & campus
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailBlock label="Location" value={optionalStr(space.location) ?? undefined} />
                    <DetailBlock label="University" value={optionalStr(space.university) ?? undefined} />
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 flex items-center gap-1.5">
                    <Landmark className="h-3.5 w-3.5" />
                    Directory
                  </h3>

                  <div className="space-y-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">School</p>
                    {linkedSchool ? (
                      <div className="rounded-md border border-gray-100 bg-white p-3 space-y-2">
                        <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
                          <GraduationCap className="h-3.5 w-3.5" />
                          Linked row (schools)
                        </p>
                        <p className="text-sm font-medium text-gray-900">{linkedSchool.name}</p>
                        {linkedSchool.short_name ? (
                          <p className="text-xs text-gray-600">Short name: {linkedSchool.short_name}</p>
                        ) : null}
                        {linkedSchool.location ? (
                          <p className="text-xs text-gray-600">{linkedSchool.location}</p>
                        ) : null}
                        <p className="text-[10px] font-mono text-gray-400 break-all">id {linkedSchool.id}</p>
                      </div>
                    ) : optionalStr(space.school_id) ? (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
                        <span className="font-mono">school_id</span> is set but no matching row in{' '}
                        <span className="font-mono">schools</span>.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Not linked to <span className="font-mono">schools</span>. Use full edit to attach a directory
                        school when available.
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">National organization</p>
                    {linkedOrg ? (
                      <div className="rounded-md border border-gray-100 bg-white p-3 space-y-2">
                        <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
                          <Globe2 className="h-3.5 w-3.5" />
                          Linked row (national_organizations)
                        </p>
                        <p className="text-sm font-medium text-gray-900">{linkedOrg.name}</p>
                        {linkedOrg.short_name ? (
                          <p className="text-xs text-gray-600">Short name: {linkedOrg.short_name}</p>
                        ) : null}
                        <p className="text-[10px] font-mono text-gray-400 break-all">id {linkedOrg.id}</p>
                      </div>
                    ) : optionalStr(space.national_organization_id) ? (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
                        <span className="font-mono">national_organization_id</span> is set but no matching row in{' '}
                        <span className="font-mono">national_organizations</span>.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Not linked to <span className="font-mono">national_organizations</span>. Use full edit to attach
                        when available.
                      </p>
                    )}
                  </div>

                  {optionalStr(space.school) || optionalStr(space.school_location) || optionalStr(space.national_fraternity) ? (
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                        Denormalized fields on space
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <DetailBlock label="School label" value={optionalStr(space.school) ?? undefined} />
                        <DetailBlock label="School location" value={optionalStr(space.school_location) ?? undefined} />
                        <DetailBlock label="National / category" value={optionalStr(space.national_fraternity) ?? undefined} />
                      </div>
                    </div>
                  ) : null}
                </section>

                {description ? (
                  <section className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Description</h3>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{description}</p>
                  </section>
                ) : null}

                <p className="text-[11px] text-gray-400">
                  Updated {optionalStr(space.updated_at) ? new Date(String(space.updated_at)).toLocaleString() : '—'}
                </p>
              </>
            ) : null}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
