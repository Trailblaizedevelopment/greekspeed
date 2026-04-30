'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectItem } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { X, Users, Plus, Trash2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/supabase/auth-context';
import { DeveloperSpaceSelectCombobox } from '@/components/user-management/DeveloperSpaceSelectCombobox';
import {
  DeveloperReferenceSearchField,
  type DeveloperReferenceSelection,
} from '@/components/user-management/DeveloperReferenceSearchField';
import {
  normalizeSpaceTypeInput,
  SPACE_TYPE_SEARCHABLE_OPTIONS,
} from '@/lib/spaceTypeTaxonomy';
import { fileToImageDataUrl } from '@/lib/utils/readImageFileAsDataUrl';
import { LocationPicker } from '@/components/features/location/LocationPicker';
import { formatCanonicalPlaceDisplayForApp, type CanonicalPlaceConfirmed } from '@/types/canonicalPlace';

const MAX_ROWS = 50;

type RoleChoice = 'admin' | 'active_member' | 'alumni';

/** Mirrors `CreateUserForm` extra-space rows for `additional_space_memberships`. */
export type BulkExtraSpaceRow =
  | { id: string; kind: 'existing'; spaceId: string; label: string; asSpaceIcon: boolean }
  | {
      id: string;
      kind: 'new';
      name: string;
      category: string;
      asSpaceIcon: boolean;
      schoolLink: DeveloperReferenceSelection | null;
      orgLink: DeveloperReferenceSelection | null;
      spaceImageDataUrl: string | null;
      memberCount: string;
      foundedYear: string;
      /** Mapbox-confirmed place for `new_space.location` (same flow as profile LocationPicker). */
      locationPlace: CanonicalPlaceConfirmed | null;
    };

const CHAPTER_ROLE_PRESETS = [
  { value: 'member', label: 'Member' },
  { value: 'president', label: 'President' },
  { value: 'vice_president', label: 'Vice President' },
  { value: 'secretary', label: 'Secretary' },
  { value: 'treasurer', label: 'Treasurer' },
  { value: 'rush_chair', label: 'Rush Chair' },
  { value: 'social_chair', label: 'Social Chair' },
  { value: 'philanthropy_chair', label: 'Philanthropy Chair' },
  { value: 'risk_management_chair', label: 'Risk Mgmt Chair' },
  { value: 'alumni_relations_chair', label: 'Alumni Relations' },
  { value: 'pledge', label: 'Pledge' },
] as const;

function newRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyExtraExisting(): BulkExtraSpaceRow {
  return {
    id: newRowId(),
    kind: 'existing',
    spaceId: '',
    label: '',
    asSpaceIcon: false,
  };
}

function emptyExtraNew(): BulkExtraSpaceRow {
  return {
    id: newRowId(),
    kind: 'new',
    name: '',
    category: '',
    asSpaceIcon: false,
    schoolLink: null,
    orgLink: null,
    spaceImageDataUrl: null,
    memberCount: '',
    foundedYear: '',
    locationPlace: null,
  };
}

export interface BulkCreateUsersModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  chapterContext?: {
    chapterId: string;
    chapterName: string;
    isChapterAdmin?: boolean;
  };
  isDeveloper: boolean;
}

export interface BulkUserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: RoleChoice;
  chapterRole: string;
  chapterRoleCustom: boolean;
  /** Developer + no chapterContext: pick existing UUID home or create a new shell (API: newSpace + is_space_icon). */
  homeAttachMode: 'existing' | 'new';
  homeSpaceId: string;
  homeSpaceLabel: string;
  homeAsSpaceIcon: boolean;
  newHomeSpaceName: string;
  newHomeSpaceCategory: string;
  newHomeSchoolLink: DeveloperReferenceSelection | null;
  newHomeOrgLink: DeveloperReferenceSelection | null;
  newHomeSpaceImageDataUrl: string | null;
  newHomeMemberCount: string;
  newHomeFoundedYear: string;
  newHomeLocationPlace: CanonicalPlaceConfirmed | null;
  extraSpaceRows: BulkExtraSpaceRow[];
}

function emptyNewHomeFields(): Pick<
  BulkUserRow,
  | 'newHomeSpaceName'
  | 'newHomeSpaceCategory'
  | 'newHomeSchoolLink'
  | 'newHomeOrgLink'
  | 'newHomeSpaceImageDataUrl'
  | 'newHomeMemberCount'
  | 'newHomeFoundedYear'
  | 'newHomeLocationPlace'
> {
  return {
    newHomeSpaceName: '',
    newHomeSpaceCategory: '',
    newHomeSchoolLink: null,
    newHomeOrgLink: null,
    newHomeSpaceImageDataUrl: null,
    newHomeMemberCount: '',
    newHomeFoundedYear: '',
    newHomeLocationPlace: null,
  };
}

function createEmptyRow(chapterContext?: BulkCreateUsersModalProps['chapterContext']): BulkUserRow {
  return {
    id: newRowId(),
    firstName: '',
    lastName: '',
    email: '',
    role: 'active_member',
    chapterRole: 'member',
    chapterRoleCustom: false,
    homeAttachMode: 'existing',
    homeSpaceId: chapterContext?.chapterId ?? '',
    homeSpaceLabel: chapterContext?.chapterName ?? '',
    homeAsSpaceIcon: false,
    ...emptyNewHomeFields(),
    extraSpaceRows: [],
  };
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

function isPresetChapterRole(v: string): boolean {
  return CHAPTER_ROLE_PRESETS.some((p) => p.value === v);
}

function parseOptionalBoundedInt(raw: string, min: number, max: number): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.floor(n);
  if (i < min || i > max) return undefined;
  return i;
}

function collectRowsForSubmit(rows: BulkUserRow[]): { ok: true; data: BulkUserRow[] } | { ok: false; error: string } {
  const complete: BulkUserRow[] = [];
  const partialLineNumbers: number[] = [];

  rows.forEach((row, index) => {
    const fn = row.firstName.trim();
    const ln = row.lastName.trim();
    const em = row.email.trim();
    const rawCr = row.chapterRole.trim();
    const cr = row.chapterRoleCustom && !rawCr ? 'member' : rawCr || 'member';
    if (!fn && !ln && !em) return;
    const filled = Boolean(fn || ln || em);
    const completeRow = Boolean(fn && ln && em && em.includes('@'));
    if (filled && !completeRow) {
      partialLineNumbers.push(index + 1);
    }
    if (completeRow) {
      complete.push({
        ...row,
        firstName: fn,
        lastName: ln,
        email: em,
        chapterRole: cr,
        chapterRoleCustom: row.chapterRoleCustom,
      });
    }
  });

  if (partialLineNumbers.length > 0) {
    return {
      ok: false,
      error: `Row ${partialLineNumbers.join(', ')}: each started row needs first name, last name, and a valid email.`,
    };
  }
  if (complete.length === 0) {
    return { ok: false, error: 'Add at least one row with first name, last name, and email.' };
  }
  if (complete.length > MAX_ROWS) {
    return { ok: false, error: `At most ${MAX_ROWS} users per batch.` };
  }
  return { ok: true, data: complete };
}

function buildNewHomeSpacePayload(row: BulkUserRow): Record<string, unknown> | null {
  const name = row.newHomeSpaceName.trim();
  if (!name) return null;
  const cat = normalizeSpaceTypeInput(row.newHomeSpaceCategory);
  const school_id = row.newHomeSchoolLink?.kind === 'school' ? row.newHomeSchoolLink.id : undefined;
  const national_organization_id =
    row.newHomeOrgLink?.kind === 'national_organization' ? row.newHomeOrgLink.id : undefined;
  const mc = parseOptionalBoundedInt(row.newHomeMemberCount, 0, 2_000_000);
  const fy = parseOptionalBoundedInt(row.newHomeFoundedYear, 1800, 2100);
  const loc = row.newHomeLocationPlace
    ? formatCanonicalPlaceDisplayForApp(row.newHomeLocationPlace).trim().slice(0, 500)
    : '';
  return {
    name,
    ...(cat ? { category: cat } : {}),
    ...(school_id ? { school_id } : {}),
    ...(national_organization_id ? { national_organization_id } : {}),
    ...(row.newHomeSpaceImageDataUrl ? { image_data_url: row.newHomeSpaceImageDataUrl } : {}),
    ...(mc !== undefined ? { member_count: mc } : {}),
    ...(fy !== undefined ? { founded_year: fy } : {}),
    ...(loc ? { location: loc } : {}),
  };
}

function validateRowSpaces(
  row: BulkUserRow,
  displayIndex: number,
  isDeveloper: boolean,
  chapterLocked: boolean
): string | null {
  if (chapterLocked || !isDeveloper) {
    if (!isUuid(row.homeSpaceId)) {
      return `User row ${displayIndex}: select a valid home space (UUID).`;
    }
  } else if (row.homeAttachMode === 'existing') {
    if (!isUuid(row.homeSpaceId)) {
      return `User row ${displayIndex}: select an existing home space or choose “Create new space”.`;
    }
  } else if (!row.newHomeSpaceName.trim()) {
    return `User row ${displayIndex}: enter a display name for the new home space or choose “Existing space”.`;
  }

  if (isDeveloper && row.homeAttachMode === 'existing' && row.homeAsSpaceIcon && !isUuid(row.homeSpaceId)) {
    return `User row ${displayIndex}: Space Icon on home requires a selected space.`;
  }
  for (let i = 0; i < row.extraSpaceRows.length; i += 1) {
    const ex = row.extraSpaceRows[i]!;
    if (ex.kind === 'existing') {
      if (!ex.spaceId.trim()) {
        return `User row ${displayIndex}, extra space ${i + 1}: pick a space or remove the row.`;
      }
      if (!isUuid(ex.spaceId.trim())) {
        return `User row ${displayIndex}, extra space ${i + 1}: invalid space id.`;
      }
    } else {
      if (!ex.name.trim()) {
        return `User row ${displayIndex}, extra space ${i + 1}: new space needs a display name or remove the row.`;
      }
    }
  }
  return null;
}

function buildAdditionalSpaceMemberships(row: BulkUserRow): Record<string, unknown>[] {
  return row.extraSpaceRows
    .map((er) => {
      if (er.kind === 'existing') {
        if (!er.spaceId.trim()) return null;
        return { space_id: er.spaceId.trim(), is_space_icon: er.asSpaceIcon };
      }
      const cat = normalizeSpaceTypeInput(er.category);
      const school_id = er.schoolLink?.kind === 'school' ? er.schoolLink.id : undefined;
      const national_organization_id =
        er.orgLink?.kind === 'national_organization' ? er.orgLink.id : undefined;
      const mc = parseOptionalBoundedInt(er.memberCount, 0, 2_000_000);
      const fy = parseOptionalBoundedInt(er.foundedYear, 1800, 2100);
      const loc = er.locationPlace
        ? formatCanonicalPlaceDisplayForApp(er.locationPlace).trim().slice(0, 500)
        : '';
      return {
        new_space: {
          name: er.name.trim(),
          ...(cat ? { category: cat } : {}),
          ...(school_id ? { school_id } : {}),
          ...(national_organization_id ? { national_organization_id } : {}),
          ...(er.spaceImageDataUrl ? { image_data_url: er.spaceImageDataUrl } : {}),
          ...(mc !== undefined ? { member_count: mc } : {}),
          ...(fy !== undefined ? { founded_year: fy } : {}),
          ...(loc ? { location: loc } : {}),
        },
        is_space_icon: er.asSpaceIcon,
      };
    })
    .filter(Boolean) as Record<string, unknown>[];
}

function buildCreateUserBody(
  row: BulkUserRow,
  isDeveloper: boolean,
  chapterLocked: boolean
): Record<string, unknown> {
  const additional = isDeveloper ? buildAdditionalSpaceMemberships(row) : [];
  const canNewHomeShell = isDeveloper && !chapterLocked && row.homeAttachMode === 'new';
  const newHomePayload = canNewHomeShell ? buildNewHomeSpacePayload(row) : null;

  const body: Record<string, unknown> = {
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    chapter_role: row.chapterRole.trim() || 'member',
    is_developer: false,
    ...(additional.length > 0 ? { additional_space_memberships: additional } : {}),
  };

  if (canNewHomeShell && newHomePayload) {
    body.chapter = null;
    body.newSpace = newHomePayload;
    body.is_space_icon = true;
  } else {
    body.chapter = row.homeSpaceId.trim();
    if (isDeveloper && row.homeAsSpaceIcon) {
      body.is_space_icon = true;
    }
  }
  return body;
}

export function BulkCreateUsersModal({
  open,
  onClose,
  onSuccess,
  chapterContext,
  isDeveloper,
}: BulkCreateUsersModalProps) {
  const { getAuthHeaders, session } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [rows, setRows] = useState<BulkUserRow[]>(() => [createEmptyRow(chapterContext)]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [resultLog, setResultLog] = useState<
    { email: string; ok: boolean; message: string; tempPassword?: string }[]
  >([]);

  const spaceSelectPortalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = () => setIsMobile(window.innerWidth < 640);
    mq();
    window.addEventListener('resize', mq);
    return () => window.removeEventListener('resize', mq);
  }, []);

  useEffect(() => {
    if (!chapterContext) return;
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        homeAttachMode: 'existing' as const,
        homeSpaceId: chapterContext.chapterId,
        homeSpaceLabel: chapterContext.chapterName,
        homeAsSpaceIcon: false,
        ...emptyNewHomeFields(),
      }))
    );
  }, [chapterContext]);

  useEffect(() => {
    if (!open) {
      setRows([createEmptyRow(chapterContext)]);
      setProgress(null);
      setResultLog([]);
    }
  }, [open, chapterContext]);

  const chapterLocked = Boolean(chapterContext);

  const canSubmitPreview = useMemo(() => {
    const r = collectRowsForSubmit(rows);
    if (!r.ok || r.data.length === 0) return false;
    return r.data.every((row) => {
      if (chapterLocked || !isDeveloper) {
        return isUuid(row.homeSpaceId);
      }
      if (row.homeAttachMode === 'existing') {
        return isUuid(row.homeSpaceId);
      }
      return row.newHomeSpaceName.trim().length > 0;
    });
  }, [rows, chapterLocked, isDeveloper]);

  if (!open) {
    return null;
  }

  const updateRow = (id: string, patch: Partial<BulkUserRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const setExtraRows = (userRowId: string, updater: (prev: BulkExtraSpaceRow[]) => BulkExtraSpaceRow[]) => {
    setRows((prev) =>
      prev.map((r) => (r.id === userRowId ? { ...r, extraSpaceRows: updater(r.extraSpaceRows) } : r))
    );
  };

  const addRow = () => {
    setRows((prev) =>
      prev.length >= MAX_ROWS ? prev : [...prev, createEmptyRow(chapterContext)]
    );
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };

  const handleRun = async () => {
    const collected = collectRowsForSubmit(rows);
    if (!collected.ok) {
      alert(collected.error);
      return;
    }
    for (let i = 0; i < collected.data.length; i += 1) {
      const err = validateRowSpaces(collected.data[i]!, i + 1, isDeveloper, chapterLocked);
      if (err) {
        alert(err);
        return;
      }
    }

    setSubmitting(true);
    setResultLog([]);
    setProgress({ current: 0, total: collected.data.length });

    const outcomes: { email: string; ok: boolean; message: string; tempPassword?: string }[] = [];

    for (let i = 0; i < collected.data.length; i += 1) {
      const row = collected.data[i]!;
      setProgress({ current: i + 1, total: collected.data.length });
      const body = buildCreateUserBody(row, isDeveloper, chapterLocked);

      try {
        const response = await fetch('/api/developer/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify(body),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          outcomes.push({
            email: row.email,
            ok: false,
            message: typeof data.error === 'string' ? data.error : `HTTP ${response.status}`,
          });
        } else {
          outcomes.push({
            email: row.email,
            ok: true,
            message: 'Created',
            tempPassword: typeof data.tempPassword === 'string' ? data.tempPassword : undefined,
          });
        }
      } catch (e) {
        outcomes.push({
          email: row.email,
          ok: false,
          message: e instanceof Error ? e.message : 'Request failed',
        });
      }
    }

    setResultLog(outcomes);
    setProgress(null);
    setSubmitting(false);

    const okCount = outcomes.filter((o) => o.ok).length;
    if (okCount > 0) {
      onSuccess();
    }
  };

  const downloadResultsCsv = () => {
    if (resultLog.length === 0) return;
    const header = 'email,status,message,temp_password\n';
    const lines = resultLog.map((r) => {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [esc(r.email), r.ok ? 'ok' : 'error', esc(r.message), esc(r.tempPassword ?? '')].join(',');
    });
    const blob = new Blob([header + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bulk-create-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fieldClass = 'h-9 text-sm rounded-lg border-gray-200 bg-white';
  const selectClass = cn(fieldClass, 'mt-0');

  const rowEditor = (row: BulkUserRow, index: number) => {
    const useCustomChapter =
      row.chapterRoleCustom || (row.chapterRole.trim() !== '' && !isPresetChapterRole(row.chapterRole));
    const chapterSelectValue = useCustomChapter ? '__custom__' : row.chapterRole || 'member';

    return (
      <div
        key={row.id}
        className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm lg:rounded-lg lg:border-gray-200 lg:p-4"
      >
        <p className="mb-2 text-xs font-medium text-gray-500 lg:hidden">User {index + 1}</p>

        <div className="grid gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end lg:gap-2">
          <div className="min-w-0">
            <Label htmlFor={`bulk-fn-${row.id}`} className="text-xs text-gray-600 lg:sr-only">
              First name
            </Label>
            <Input
              id={`bulk-fn-${row.id}`}
              value={row.firstName}
              onChange={(e) => updateRow(row.id, { firstName: e.target.value })}
              placeholder="First"
              disabled={submitting}
              className={fieldClass}
              autoComplete="off"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor={`bulk-ln-${row.id}`} className="text-xs text-gray-600 lg:sr-only">
              Last name
            </Label>
            <Input
              id={`bulk-ln-${row.id}`}
              value={row.lastName}
              onChange={(e) => updateRow(row.id, { lastName: e.target.value })}
              placeholder="Last"
              disabled={submitting}
              className={fieldClass}
              autoComplete="off"
            />
          </div>
          <div className="min-w-0 lg:col-span-1">
            <Label htmlFor={`bulk-em-${row.id}`} className="text-xs text-gray-600 lg:sr-only">
              Email
            </Label>
            <Input
              id={`bulk-em-${row.id}`}
              type="email"
              value={row.email}
              onChange={(e) => updateRow(row.id, { email: e.target.value })}
              placeholder="email@example.com"
              disabled={submitting}
              className={fieldClass}
              autoComplete="off"
            />
          </div>
          <div className="min-w-0">
            <Label className="text-xs text-gray-600 lg:sr-only">Role</Label>
            <Select
              value={row.role}
              onValueChange={(v) => updateRow(row.id, { role: v as RoleChoice })}
              disabled={submitting}
              className={selectClass}
            >
              <SelectItem value="active_member">Active</SelectItem>
              <SelectItem value="alumni">Alumni</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="text-xs text-gray-600 lg:sr-only">Chapter role</Label>
            <Select
              value={chapterSelectValue}
              onValueChange={(v) => {
                if (v === '__custom__') {
                  updateRow(row.id, {
                    chapterRoleCustom: true,
                    chapterRole: useCustomChapter ? row.chapterRole : '',
                  });
                } else {
                  updateRow(row.id, { chapterRoleCustom: false, chapterRole: v });
                }
              }}
              disabled={submitting}
              className={selectClass}
            >
              {CHAPTER_ROLE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value="__custom__">Custom…</SelectItem>
            </Select>
            {useCustomChapter ? (
              <Input
                value={row.chapterRole}
                onChange={(e) => updateRow(row.id, { chapterRole: e.target.value, chapterRoleCustom: true })}
                placeholder="Title"
                disabled={submitting}
                maxLength={50}
                className={cn(fieldClass, 'mt-1.5')}
              />
            ) : null}
          </div>
          <div className="flex justify-end pt-1 lg:flex lg:items-end lg:justify-center lg:pb-0.5 lg:pt-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 text-gray-500 hover:text-red-600"
              onClick={() => removeRow(row.id)}
              disabled={submitting || rows.length <= 1}
              aria-label={`Remove row ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <details className="group mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50/80 open:bg-gray-50/90">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-gray-900 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
            Home space & memberships
          </summary>
          <div className="space-y-4 border-t border-gray-200/80 px-3 pb-3 pt-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-700">Home space (chapter)</Label>
              {chapterContext ? (
                <Input value={chapterContext.chapterName} disabled className="bg-gray-100" />
              ) : isDeveloper ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={row.homeAttachMode === 'existing' ? 'default' : 'outline'}
                      className="rounded-full"
                      onClick={() =>
                        updateRow(row.id, { homeAttachMode: 'existing', ...emptyNewHomeFields() })
                      }
                      disabled={submitting}
                    >
                      Existing space
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={row.homeAttachMode === 'new' ? 'default' : 'outline'}
                      className="rounded-full"
                      onClick={() =>
                        updateRow(row.id, {
                          homeAttachMode: 'new',
                          homeSpaceId: '',
                          homeSpaceLabel: '',
                          homeAsSpaceIcon: false,
                        })
                      }
                      disabled={submitting}
                    >
                      Create new space
                    </Button>
                  </div>
                  {row.homeAttachMode === 'existing' ? (
                    <>
                      <DeveloperSpaceSelectCombobox
                        id={`bulk-home-${row.id}`}
                        value={row.homeSpaceId}
                        selectedLabel={row.homeSpaceLabel}
                        onValueChange={(spaceId, spaceName) => {
                          updateRow(row.id, { homeSpaceId: spaceId, homeSpaceLabel: spaceName });
                        }}
                        disabled={submitting}
                      />
                      <p className="text-xs text-muted-foreground">
                        Primary chapter for this user. Search the full space directory.
                      </p>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <Label htmlFor={`bulk-newhome-name-${row.id}`}>New space display name *</Label>
                        <Input
                          id={`bulk-newhome-name-${row.id}`}
                          value={row.newHomeSpaceName}
                          onChange={(e) => updateRow(row.id, { newHomeSpaceName: e.target.value })}
                          placeholder="Display name"
                          disabled={submitting}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Organization type (optional)</Label>
                        <SearchableSelect
                          value={row.newHomeSpaceCategory}
                          onValueChange={(v) => updateRow(row.id, { newHomeSpaceCategory: v })}
                          options={SPACE_TYPE_SEARCHABLE_OPTIONS}
                          placeholder="Select or type…"
                          searchPlaceholder="Search types…"
                          allowCustom
                          customMaxLength={200}
                          disabled={submitting}
                          portalContainerRef={spaceSelectPortalRef}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <DeveloperReferenceSearchField
                          label="School (optional)"
                          labelHint="Optional school_id on the new shell space."
                          kind="schools"
                          accessToken={session?.access_token}
                          value={row.newHomeSchoolLink?.kind === 'school' ? row.newHomeSchoolLink : null}
                          onChange={(next) =>
                            updateRow(row.id, {
                              newHomeSchoolLink: next?.kind === 'school' ? next : null,
                            })
                          }
                          disabled={submitting}
                        />
                        <DeveloperReferenceSearchField
                          label="National organization (optional)"
                          labelHint="Optional national_organization_id on the new shell space."
                          kind="national-organizations"
                          accessToken={session?.access_token}
                          value={
                            row.newHomeOrgLink?.kind === 'national_organization' ? row.newHomeOrgLink : null
                          }
                          onChange={(next) =>
                            updateRow(row.id, {
                              newHomeOrgLink:
                                next?.kind === 'national_organization' ? next : null,
                            })
                          }
                          disabled={submitting}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1 sm:col-span-3">
                          <LocationPicker
                            label="Location (optional)"
                            fieldId={`bulk-newhome-loc-${row.id}`}
                            country="us"
                            suggestionsPortalRef={spaceSelectPortalRef}
                            value={row.newHomeLocationPlace}
                            onChange={(place) => updateRow(row.id, { newHomeLocationPlace: place })}
                            disabled={submitting}
                          />
                          <p className="text-xs text-muted-foreground">
                            Same Mapbox search and confirm flow as profile edit (US).
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`bulk-newhome-mc-${row.id}`}>Active members (optional)</Label>
                          <Input
                            id={`bulk-newhome-mc-${row.id}`}
                            inputMode="numeric"
                            value={row.newHomeMemberCount}
                            onChange={(e) =>
                              updateRow(row.id, {
                                newHomeMemberCount: e.target.value.replace(/\D/g, ''),
                              })
                            }
                            placeholder="e.g. 42"
                            disabled={submitting}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`bulk-newhome-fy-${row.id}`}>Founded year (optional)</Label>
                          <Input
                            id={`bulk-newhome-fy-${row.id}`}
                            inputMode="numeric"
                            value={row.newHomeFoundedYear}
                            onChange={(e) =>
                              updateRow(row.id, {
                                newHomeFoundedYear: e.target.value.replace(/\D/g, '').slice(0, 4),
                              })
                            }
                            placeholder="e.g. 1910"
                            disabled={submitting}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Space image (optional)</Label>
                        <Input
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/gif"
                          className="max-w-xs cursor-pointer text-sm file:mr-2"
                          disabled={submitting}
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            const r = await fileToImageDataUrl(f);
                            if (!r.ok) {
                              alert(r.error);
                              return;
                            }
                            updateRow(row.id, { newHomeSpaceImageDataUrl: r.dataUrl });
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <DeveloperSpaceSelectCombobox
                    id={`bulk-home-${row.id}`}
                    value={row.homeSpaceId}
                    selectedLabel={row.homeSpaceLabel}
                    onValueChange={(spaceId, spaceName) => {
                      updateRow(row.id, { homeSpaceId: spaceId, homeSpaceLabel: spaceName });
                    }}
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground">Primary chapter for this user.</p>
                </>
              )}
            </div>

            {isDeveloper && (chapterContext || row.homeAttachMode === 'existing') ? (
              <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-white/90 p-3">
                <Checkbox
                  id={`bulk-home-icon-${row.id}`}
                  checked={row.homeAsSpaceIcon}
                  onCheckedChange={(c) => updateRow(row.id, { homeAsSpaceIcon: Boolean(c) })}
                  disabled={submitting || !isUuid(row.homeSpaceId)}
                />
                <div className="min-w-0">
                  <Label htmlFor={`bulk-home-icon-${row.id}`} className="cursor-pointer text-sm font-medium">
                    Space Icon on home space
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Optional. Requires a valid space above. Replaces any existing icon for that space.
                  </p>
                </div>
              </div>
            ) : isDeveloper && !chapterContext && row.homeAttachMode === 'new' ? (
              <p className="rounded-md border border-dashed border-gray-200 bg-gray-50/80 px-3 py-2 text-xs text-muted-foreground">
                Creating a new home space uses the same API path as Create User: this user is set as Space Icon on the
                new shell (required to provision the space).
              </p>
            ) : null}

            {isDeveloper ? (
              <div className="space-y-3 rounded-md border border-gray-200 bg-white/90 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">Additional spaces</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setExtraRows(row.id, (prev) => [...prev, emptyExtraExisting()])}
                    disabled={submitting}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Add space
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Extra memberships (non-primary). Duplicates of this user&apos;s home space are skipped by the server.
                  Each row can mark Space Icon for that space.
                </p>
                {row.extraSpaceRows.length === 0 ? (
                  <p className="text-xs text-gray-500">None — optional.</p>
                ) : (
                  <div className="space-y-3">
                    {row.extraSpaceRows.map((ex, exIdx) => (
                      <div
                        key={ex.id}
                        className="space-y-2 rounded-md border border-gray-200 bg-gray-50/80 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-gray-600">Extra #{exIdx + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-destructive"
                            onClick={() =>
                              setExtraRows(row.id, (prev) => prev.filter((x) => x.id !== ex.id))
                            }
                            disabled={submitting}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Remove
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={ex.kind === 'existing' ? 'default' : 'outline'}
                            className="rounded-full"
                            onClick={() =>
                              setExtraRows(row.id, (prev) =>
                                prev.map((r) =>
                                  r.id === ex.id
                                    ? {
                                        id: r.id,
                                        kind: 'existing',
                                        spaceId: '',
                                        label: '',
                                        asSpaceIcon: false,
                                      }
                                    : r
                                )
                              )
                            }
                            disabled={submitting}
                          >
                            Existing space
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={ex.kind === 'new' ? 'default' : 'outline'}
                            className="rounded-full"
                            onClick={() =>
                              setExtraRows(row.id, (prev) =>
                                prev.map((r) =>
                                  r.id === ex.id ? { ...emptyExtraNew(), id: ex.id } : r
                                )
                              )
                            }
                            disabled={submitting}
                          >
                            New space
                          </Button>
                        </div>
                        {ex.kind === 'existing' ? (
                          <div className="space-y-1.5">
                            <Label htmlFor={`extra-sp-${ex.id}`}>Search space</Label>
                            <DeveloperSpaceSelectCombobox
                              id={`extra-sp-${ex.id}`}
                              value={ex.spaceId}
                              selectedLabel={ex.label}
                              onValueChange={(spaceId, spaceName) => {
                                setExtraRows(row.id, (prev) =>
                                  prev.map((r) =>
                                    r.id === ex.id && r.kind === 'existing'
                                      ? { ...r, spaceId, label: spaceName }
                                      : r
                                  )
                                );
                              }}
                              disabled={submitting}
                            />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div>
                              <Label htmlFor={`extra-nm-${ex.id}`}>New space name *</Label>
                              <Input
                                id={`extra-nm-${ex.id}`}
                                value={ex.name}
                                onChange={(e) =>
                                  setExtraRows(row.id, (prev) =>
                                    prev.map((r) =>
                                      r.id === ex.id && r.kind === 'new' ? { ...r, name: e.target.value } : r
                                    )
                                  )
                                }
                                placeholder="Display name"
                                disabled={submitting}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Organization type (optional)</Label>
                              <SearchableSelect
                                value={ex.category}
                                onValueChange={(v) =>
                                  setExtraRows(row.id, (prev) =>
                                    prev.map((r) =>
                                      r.id === ex.id && r.kind === 'new' ? { ...r, category: v } : r
                                    )
                                  )
                                }
                                options={SPACE_TYPE_SEARCHABLE_OPTIONS}
                                placeholder="Select or type…"
                                searchPlaceholder="Search types…"
                                allowCustom
                                customMaxLength={200}
                                disabled={submitting}
                                portalContainerRef={spaceSelectPortalRef}
                              />
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <DeveloperReferenceSearchField
                                label="School (optional)"
                                labelHint="Optional school_id on the new shell space."
                                kind="schools"
                                accessToken={session?.access_token}
                                value={ex.schoolLink?.kind === 'school' ? ex.schoolLink : null}
                                onChange={(next) =>
                                  setExtraRows(row.id, (prev) =>
                                    prev.map((r) =>
                                      r.id === ex.id && r.kind === 'new'
                                        ? { ...r, schoolLink: next?.kind === 'school' ? next : null }
                                        : r
                                    )
                                  )
                                }
                                disabled={submitting}
                              />
                              <DeveloperReferenceSearchField
                                label="National organization (optional)"
                                labelHint="Optional national_organization_id on the new shell space."
                                kind="national-organizations"
                                accessToken={session?.access_token}
                                value={ex.orgLink?.kind === 'national_organization' ? ex.orgLink : null}
                                onChange={(next) =>
                                  setExtraRows(row.id, (prev) =>
                                    prev.map((r) =>
                                      r.id === ex.id && r.kind === 'new'
                                        ? { ...r, orgLink: next?.kind === 'national_organization' ? next : null }
                                        : r
                                    )
                                  )
                                }
                                disabled={submitting}
                              />
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <div className="space-y-1 sm:col-span-3">
                                <LocationPicker
                                  label="Location (optional)"
                                  fieldId={`extra-loc-${ex.id}`}
                                  country="us"
                                  suggestionsPortalRef={spaceSelectPortalRef}
                                  value={ex.locationPlace}
                                  onChange={(place) =>
                                    setExtraRows(row.id, (prev) =>
                                      prev.map((r) =>
                                        r.id === ex.id && r.kind === 'new' ? { ...r, locationPlace: place } : r
                                      )
                                    )
                                  }
                                  disabled={submitting}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Same Mapbox search and confirm flow as profile edit (US).
                                </p>
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`ex-mc-${ex.id}`}>Active members (optional)</Label>
                                <Input
                                  id={`ex-mc-${ex.id}`}
                                  inputMode="numeric"
                                  value={ex.memberCount}
                                  onChange={(e) =>
                                    setExtraRows(row.id, (prev) =>
                                      prev.map((r) =>
                                        r.id === ex.id && r.kind === 'new'
                                          ? { ...r, memberCount: e.target.value.replace(/\D/g, '') }
                                          : r
                                      )
                                    )
                                  }
                                  placeholder="e.g. 42"
                                  disabled={submitting}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`ex-fy-${ex.id}`}>Founded year (optional)</Label>
                                <Input
                                  id={`ex-fy-${ex.id}`}
                                  inputMode="numeric"
                                  value={ex.foundedYear}
                                  onChange={(e) =>
                                    setExtraRows(row.id, (prev) =>
                                      prev.map((r) =>
                                        r.id === ex.id && r.kind === 'new'
                                          ? { ...r, foundedYear: e.target.value.replace(/\D/g, '').slice(0, 4) }
                                          : r
                                      )
                                    )
                                  }
                                  placeholder="e.g. 1910"
                                  disabled={submitting}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm">Space image (optional)</Label>
                              <Input
                                type="file"
                                accept="image/jpeg,image/jpg,image/png,image/gif"
                                className="max-w-xs cursor-pointer text-sm file:mr-2"
                                disabled={submitting}
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!f) return;
                                  const r = await fileToImageDataUrl(f);
                                  if (!r.ok) {
                                    alert(r.error);
                                    return;
                                  }
                                  setExtraRows(row.id, (prev) =>
                                    prev.map((x) =>
                                      x.id === ex.id && x.kind === 'new' ? { ...x, spaceImageDataUrl: r.dataUrl } : x
                                    )
                                  );
                                }}
                              />
                            </div>
                          </div>
                        )}
                        <div className="flex items-start gap-2 pt-1">
                          <Checkbox
                            id={`ex-icon-${ex.id}`}
                            checked={ex.asSpaceIcon}
                            onCheckedChange={(checked) =>
                              setExtraRows(row.id, (prev) =>
                                prev.map((r) =>
                                  r.id === ex.id ? { ...r, asSpaceIcon: Boolean(checked) } : r
                                )
                              )
                            }
                            disabled={submitting}
                          />
                          <Label
                            htmlFor={`ex-icon-${ex.id}`}
                            className="cursor-pointer text-xs font-normal leading-snug text-gray-700"
                          >
                            Space Icon for this space
                          </Label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Additional space memberships require a developer account (same as Create User).
              </p>
            )}
          </div>
        </details>
      </div>
    );
  };

  const body = (
    <div ref={spaceSelectPortalRef} className="relative space-y-5">
      <p className="text-sm text-gray-600">
        One user per row; empty identity rows are skipped (up to {MAX_ROWS}). Open{' '}
        <strong>Home space & memberships</strong> on each row to set that user&apos;s home space, optional home Space
        Icon, and optional extra spaces (developers).
      </p>

      <div className="space-y-3">
        <div className="hidden px-0 pb-1 lg:block">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 border-b border-gray-100 pb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">First name</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Last name</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Email</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Role</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Chapter role</span>
            <span className="sr-only">Remove</span>
          </div>
        </div>

        <div className="space-y-4">{rows.map((row, i) => rowEditor(row, i))}</div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2 rounded-full sm:w-auto"
          onClick={addRow}
          disabled={submitting || rows.length >= MAX_ROWS}
        >
          <Plus className="h-4 w-4" />
          Add row
        </Button>
      </div>

      {progress ? (
        <p className="text-sm text-gray-600">
          Creating {progress.current} / {progress.total}…
        </p>
      ) : null}

      {resultLog.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-900">Results</p>
            <Button type="button" variant="outline" size="sm" onClick={downloadResultsCsv}>
              Download CSV
            </Button>
          </div>
          <ul className="max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-white text-sm">
            {resultLog.map((r, idx) => (
              <li
                key={`bulk-result-${idx}-${r.email}`}
                className={cn(
                  'border-b border-gray-100 px-3 py-2 last:border-0',
                  r.ok ? 'text-green-800' : 'text-red-700'
                )}
              >
                <span className="font-mono text-xs">{r.email}</span> — {r.ok ? 'created' : r.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  const footer = (
    <div className="flex flex-shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50/95 px-4 py-3 sm:px-6">
      <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
        {resultLog.length > 0 ? 'Close' : 'Cancel'}
      </Button>
      <Button type="button" onClick={handleRun} disabled={submitting || !canSubmitPreview}>
        {submitting ? 'Creating…' : 'Create users'}
      </Button>
    </div>
  );

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-[9999]">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !submitting && onClose()} />
        <div
          className="fixed bottom-0 left-0 right-0 z-10 flex max-h-[90dvh] min-h-0 flex-col rounded-t-2xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-600" aria-hidden />
              <div>
                <h3 className="text-lg font-semibold leading-tight">Bulk create users</h3>
                <p className="text-xs text-muted-foreground">Per-row home space & memberships</p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} disabled={submitting}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{body}</div>
          {footer}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="relative z-[10000] w-full max-w-5xl">
        <Card
          className="relative flex max-h-[min(92vh,900px)] w-full min-h-0 flex-col overflow-hidden rounded-xl shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <CardHeader className="shrink-0 border-b border-gray-200 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-gray-600" aria-hidden />
                <div>
                  <CardTitle className="text-lg font-semibold">Bulk create users</CardTitle>
                  <p className="mt-1 text-sm text-gray-500">Per-row home space, icons, and extra memberships</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={submitting}
                className="h-8 w-8 shrink-0 p-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">{body}</div>
            {footer}
          </CardContent>
        </Card>
      </div>
    </div>,
    document.body
  );
}
