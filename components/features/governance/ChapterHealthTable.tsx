'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveChapter } from '@/lib/contexts/ActiveChapterContext';
import { useChapterHealth } from '@/lib/hooks/useChapterHealth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ChapterHealthRow } from '@/types/governance';

type SortField = keyof Pick<
  ChapterHealthRow,
  | 'chapterName'
  | 'school'
  | 'activeMembers'
  | 'alumniCount'
  | 'engagementPercent'
  | 'lastActivityAt'
  | 'status'
>;

type SortDirection = 'asc' | 'desc';

interface ColumnDef {
  key: SortField;
  label: string;
  minWidth?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'chapterName', label: 'Chapter', minWidth: 'min-w-[180px]' },
  { key: 'school', label: 'School', minWidth: 'min-w-[160px]' },
  { key: 'activeMembers', label: 'Active Members', minWidth: 'min-w-[130px]' },
  { key: 'alumniCount', label: 'Alumni', minWidth: 'min-w-[100px]' },
  { key: 'engagementPercent', label: 'Engagement', minWidth: 'min-w-[120px]' },
  { key: 'lastActivityAt', label: 'Last Activity', minWidth: 'min-w-[140px]' },
  { key: 'status', label: 'Status', minWidth: 'min-w-[100px]' },
];

function StatusPill({ status }: { status: ChapterHealthRow['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        status === 'active'
          ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20'
          : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20'
      )}
    >
      {status === 'active' ? 'Active' : 'At Risk'}
    </span>
  );
}

function SortIcon({ field, currentField, direction }: {
  field: SortField;
  currentField: SortField;
  direction: SortDirection;
}) {
  if (currentField !== field) {
    return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />;
  }
  return direction === 'asc' ? (
    <ChevronUp className="h-3.5 w-3.5 text-brand-primary" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5 text-brand-primary" />
  );
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function compareValues(
  a: ChapterHealthRow,
  b: ChapterHealthRow,
  field: SortField,
  direction: SortDirection
): number {
  let aVal: string | number;
  let bVal: string | number;

  switch (field) {
    case 'chapterName':
    case 'school':
    case 'status':
      aVal = a[field] ?? '';
      bVal = b[field] ?? '';
      break;
    case 'activeMembers':
    case 'alumniCount':
    case 'engagementPercent':
      aVal = a[field];
      bVal = b[field];
      break;
    case 'lastActivityAt':
      aVal = a.lastActivityAt ?? '';
      bVal = b.lastActivityAt ?? '';
      break;
    default:
      return 0;
  }

  const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
  return direction === 'asc' ? cmp : -cmp;
}

export function ChapterHealthTable() {
  const router = useRouter();
  const { setActiveChapterId } = useActiveChapter();
  const { data: rows, isLoading, error } = useChapterHealth();

  const [sortField, setSortField] = useState<SortField>('chapterName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField]
  );

  const handleRowClick = useCallback(
    (chapterId: string) => {
      setActiveChapterId(chapterId);
      router.push('/dashboard/admin');
    },
    [setActiveChapterId, router]
  );

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, chapterId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleRowClick(chapterId);
      }
    },
    [handleRowClick]
  );

  const sortedRows = rows
    ? [...rows].sort((a, b) => compareValues(a, b, sortField, sortDirection))
    : [];

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-brand-primary" />
          <span className="ml-3 text-sm text-gray-500">Loading chapter health...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Failed to load chapter health data. Please try again.
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow p-8 text-center text-sm text-gray-500">
        No managed chapters found.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              {COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    'cursor-pointer select-none transition-colors hover:bg-gray-100',
                    col.minWidth
                  )}
                  onClick={() => handleSort(col.key)}
                  aria-sort={
                    sortField === col.key
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      {col.label}
                    </span>
                    <SortIcon
                      field={col.key}
                      currentField={sortField}
                      direction={sortDirection}
                    />
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow
                key={row.chapterId}
                className="cursor-pointer transition-colors hover:bg-gray-50"
                tabIndex={0}
                role="link"
                aria-label={`View ${row.chapterName} admin dashboard`}
                onClick={() => handleRowClick(row.chapterId)}
                onKeyDown={(e) => handleRowKeyDown(e, row.chapterId)}
              >
                <TableCell className="font-medium text-gray-900">
                  {row.chapterName}
                </TableCell>
                <TableCell className="text-gray-600">{row.school || '—'}</TableCell>
                <TableCell className="text-gray-900 tabular-nums">
                  {row.activeMembers}
                </TableCell>
                <TableCell className="text-gray-900 tabular-nums">
                  {row.alumniCount}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'font-medium tabular-nums',
                      row.status === 'at_risk' ? 'text-red-600' : 'text-gray-900'
                    )}
                  >
                    {row.engagementPercent}%
                  </span>
                </TableCell>
                <TableCell className="text-gray-600 text-sm">
                  {formatRelativeTime(row.lastActivityAt)}
                </TableCell>
                <TableCell>
                  <StatusPill status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
