'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Briefcase,
  MapPin,
  AlertCircle,
  ChevronDown,
  Check,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAlumniIntelligence } from '@/lib/hooks/useAlumniIntelligence';
import { useGovernanceChapters } from '@/lib/hooks/useGovernanceChapters';
import type { IndustryAggregate, LocationAggregate } from '@/types/governance';

const MAX_VISIBLE_ROWS = 10;
const COMPLETENESS_THRESHOLD = 50;

export function AlumniIntelligence() {
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);

  const { data: chaptersData, isLoading: chaptersLoading } =
    useGovernanceChapters();

  const { data, isLoading, isError } = useAlumniIntelligence({
    chapterIds:
      selectedChapterIds.length > 0 ? selectedChapterIds : undefined,
  });

  const chapters = chaptersData?.chapters ?? [];

  return (
    <div className="space-y-4">
      {/* Chapter filter */}
      {chapters.length > 1 && (
        <ChapterFilter
          chapters={chapters}
          selected={selectedChapterIds}
          onChange={setSelectedChapterIds}
          loading={chaptersLoading}
        />
      )}

      {/* Two side-by-side cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <IndustryCard
          industries={data?.industries ?? []}
          loading={isLoading}
          error={isError}
          completeness={data?.industryCompleteness ?? null}
          totalAlumni={data?.totalAlumni ?? 0}
        />
        <LocationCard
          locations={data?.locations ?? []}
          loading={isLoading}
          error={isError}
          completeness={data?.locationCompleteness ?? null}
          totalAlumni={data?.totalAlumni ?? 0}
        />
      </div>
    </div>
  );
}

/* ─── Chapter multi-select filter ───────────────────────────────────────── */

interface ChapterFilterProps {
  chapters: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  loading: boolean;
}

function ChapterFilter({
  chapters,
  selected,
  onChange,
  loading,
}: ChapterFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleChapter = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );
  };

  const label =
    selected.length === 0
      ? 'All chapters'
      : selected.length === 1
        ? chapters.find((c) => c.id === selected[0])?.name ?? '1 chapter'
        : `${selected.length} chapters`;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
      >
        <Filter className="h-3.5 w-3.5 text-gray-400" />
        {label}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-gray-400 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          <button
            onClick={() => onChange([])}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-gray-50',
              selected.length === 0
                ? 'font-medium text-brand-primary'
                : 'text-gray-700'
            )}
          >
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                selected.length === 0
                  ? 'border-brand-primary bg-brand-primary'
                  : 'border-gray-300'
              )}
            >
              {selected.length === 0 && (
                <Check className="h-3 w-3 text-white" />
              )}
            </span>
            All chapters
          </button>
          <div className="my-1 border-t border-gray-100" />
          <div className="max-h-48 overflow-y-auto">
            {chapters.map((c) => {
              const isSelected = selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleChapter(c.id)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      isSelected
                        ? 'border-brand-primary bg-brand-primary'
                        : 'border-gray-300'
                    )}
                  >
                    {isSelected && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </span>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Industry card ─────────────────────────────────────────────────────── */

interface IndustryCardProps {
  industries: IndustryAggregate[];
  loading: boolean;
  error: boolean;
  completeness: number | null;
  totalAlumni: number;
}

function IndustryCard({
  industries,
  loading,
  error,
  completeness,
  totalAlumni,
}: IndustryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const maxCount = industries[0]?.count ?? 1;
  const visible = expanded ? industries : industries.slice(0, MAX_VISIBLE_ROWS);
  const hasMore = industries.length > MAX_VISIBLE_ROWS;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
          <Briefcase className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            Industry Breakdown
          </h3>
          <p className="text-xs text-gray-500">
            {totalAlumni > 0
              ? `${totalAlumni.toLocaleString()} alumni`
              : 'No alumni data'}
          </p>
        </div>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <BarSkeleton rows={5} />
        ) : error ? (
          <ErrorState />
        ) : industries.length === 0 ? (
          <EmptyState label="No industry data available" />
        ) : (
          <>
            {completeness !== null &&
              completeness < COMPLETENESS_THRESHOLD && (
                <CompletenessNudge
                  percent={completeness}
                  field="industry"
                />
              )}
            <ul className="space-y-2.5">
              {visible.map((item) => (
                <HorizontalBar
                  key={item.industry}
                  label={item.industry}
                  value={item.count}
                  maxValue={maxCount}
                  suffix=""
                />
              ))}
            </ul>
            {hasMore && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="mt-3 text-xs font-medium text-brand-primary hover:underline"
              >
                {expanded
                  ? 'Show less'
                  : `Show all ${industries.length} industries`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Location card ─────────────────────────────────────────────────────── */

interface LocationCardProps {
  locations: LocationAggregate[];
  loading: boolean;
  error: boolean;
  completeness: number | null;
  totalAlumni: number;
}

function LocationCard({
  locations,
  loading,
  error,
  completeness,
  totalAlumni,
}: LocationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? locations : locations.slice(0, MAX_VISIBLE_ROWS);
  const hasMore = locations.length > MAX_VISIBLE_ROWS;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <MapPin className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            Geographic Distribution
          </h3>
          <p className="text-xs text-gray-500">
            {totalAlumni > 0
              ? `${totalAlumni.toLocaleString()} alumni`
              : 'No alumni data'}
          </p>
        </div>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <BarSkeleton rows={5} />
        ) : error ? (
          <ErrorState />
        ) : locations.length === 0 ? (
          <EmptyState label="No location data available" />
        ) : (
          <>
            {completeness !== null &&
              completeness < COMPLETENESS_THRESHOLD && (
                <CompletenessNudge
                  percent={completeness}
                  field="location"
                />
              )}
            <ul className="space-y-2">
              {visible.map((loc) => (
                <li key={loc.stateCode} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-sm text-gray-700">
                    {loc.state}
                  </span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-slate-800/80 transition-all"
                      style={{
                        width: `${Math.max(loc.percent, 2)}%`,
                      }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-gray-500">
                    {loc.percent}% ({loc.count})
                  </span>
                </li>
              ))}
            </ul>
            {hasMore && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="mt-3 text-xs font-medium text-brand-primary hover:underline"
              >
                {expanded
                  ? 'Show less'
                  : `Show all ${locations.length} locations`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Shared primitives ─────────────────────────────────────────────────── */

interface HorizontalBarProps {
  label: string;
  value: number;
  maxValue: number;
  suffix: string;
}

function HorizontalBar({ label, value, maxValue }: HorizontalBarProps) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <li className="flex items-center gap-3">
      <span className="w-40 shrink-0 truncate text-sm text-gray-700">
        {label}
      </span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-slate-800/80 transition-all"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-600">
        {value}
      </span>
    </li>
  );
}

function CompletenessNudge({
  percent,
  field,
}: {
  percent: number;
  field: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p className="text-xs leading-relaxed text-amber-800">
        Only <span className="font-semibold">{percent}%</span> of alumni have{' '}
        {field} info filled in. Encourage alumni to complete their profiles for
        more accurate insights.
      </p>
    </div>
  );
}

function BarSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 flex-1 animate-pulse rounded-full bg-gray-100" />
          <div className="h-4 w-8 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-2 rounded-full bg-gray-100 p-3">
        <Briefcase className="h-5 w-5 text-gray-400" />
      </div>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-2 rounded-full bg-red-50 p-3">
        <AlertCircle className="h-5 w-5 text-red-400" />
      </div>
      <p className="text-sm text-gray-500">Failed to load data</p>
    </div>
  );
}
