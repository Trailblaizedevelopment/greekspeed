import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ChapterMemberData } from '@/types/chapter';
import type {
  MemberSearchFilters,
  FilterPreset,
  AvailableFilterOptions,
  FilterOption,
} from '@/types/memberFilters';
import { DEFAULT_MEMBER_FILTERS } from '@/types/memberFilters';
import { getRoleDisplayName } from '@/lib/permissions';
import type { ChapterRole } from '@/types/profile';

const SESSION_FILTERS_KEY = 'mychapter_filters';
const LOCAL_PRESETS_KEY = 'mychapter_filter_presets';

function loadFiltersFromSession(): Partial<MemberSearchFilters> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_FILTERS_KEY);
    return raw ? (JSON.parse(raw) as Partial<MemberSearchFilters>) : null;
  } catch {
    return null;
  }
}

function saveFiltersToSession(filters: MemberSearchFilters): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_FILTERS_KEY, JSON.stringify(filters));
  } catch { /* quota exceeded – ignore */ }
}

function loadPresets(): FilterPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_PRESETS_KEY);
    return raw ? (JSON.parse(raw) as FilterPreset[]) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: FilterPreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify(presets));
  } catch { /* quota exceeded – ignore */ }
}

function deriveOptions(members: ChapterMemberData[]): AvailableFilterOptions {
  const yearMap = new Map<string, number>();
  const majorMap = new Map<string, number>();
  const locationMap = new Map<string, number>();
  const roleMap = new Map<string, number>();

  for (const m of members) {
    if (m.grad_year) {
      const y = String(m.grad_year);
      yearMap.set(y, (yearMap.get(y) || 0) + 1);
    }
    if (m.major && m.major !== 'null') {
      const maj = m.major.trim();
      majorMap.set(maj, (majorMap.get(maj) || 0) + 1);
    }
    const loc = m.location?.trim() || m.hometown?.trim();
    if (loc && loc !== 'null') {
      locationMap.set(loc, (locationMap.get(loc) || 0) + 1);
    }
    if (m.chapter_role && m.chapter_role !== 'member') {
      const role = m.chapter_role;
      roleMap.set(role, (roleMap.get(role) || 0) + 1);
    }
  }

  const toSorted = (map: Map<string, number>, labelFn?: (k: string) => string): FilterOption[] =>
    Array.from(map.entries())
      .map(([value, count]) => ({
        value,
        label: labelFn ? labelFn(value) : value,
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

  return {
    graduationYears: Array.from(yearMap.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => Number(b.value) - Number(a.value)),
    majors: toSorted(majorMap),
    locations: toSorted(locationMap),
    chapterRoles: toSorted(roleMap, (r) => getRoleDisplayName(r as ChapterRole)),
  };
}

function countActiveAdvancedFilters(f: MemberSearchFilters): number {
  let n = 0;
  if (f.graduationYear) n++;
  if (f.major) n++;
  if (f.location) n++;
  if (f.chapterRole) n++;
  return n;
}

export function useMemberFilters(members: ChapterMemberData[]) {
  const [filters, setFiltersState] = useState<MemberSearchFilters>(() => {
    const persisted = loadFiltersFromSession();
    return persisted
      ? { ...DEFAULT_MEMBER_FILTERS, ...persisted }
      : { ...DEFAULT_MEMBER_FILTERS };
  });

  const [presets, setPresetsState] = useState<FilterPreset[]>(() => loadPresets());

  useEffect(() => {
    saveFiltersToSession(filters);
  }, [filters]);

  useEffect(() => {
    savePresets(presets);
  }, [presets]);

  const setFilters = useCallback(
    (updater: Partial<MemberSearchFilters> | ((prev: MemberSearchFilters) => MemberSearchFilters)) => {
      setFiltersState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        return next;
      });
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFiltersState({ ...DEFAULT_MEMBER_FILTERS });
  }, []);

  const availableOptions = useMemo(() => deriveOptions(members), [members]);

  const advancedFilterCount = useMemo(() => countActiveAdvancedFilters(filters), [filters]);

  const totalFilterCount = useMemo(() => {
    let n = advancedFilterCount;
    if (filters.searchTerm.trim()) n++;
    if (filters.section !== 'all') n++;
    return n;
  }, [filters, advancedFilterCount]);

  const savePreset = useCallback(
    (name: string) => {
      const preset: FilterPreset = {
        id: crypto.randomUUID(),
        name,
        filters: {
          section: filters.section,
          graduationYear: filters.graduationYear,
          major: filters.major,
          location: filters.location,
          chapterRole: filters.chapterRole,
        },
        createdAt: new Date().toISOString(),
      };
      setPresetsState((prev) => {
        const next = [...prev, preset];
        return next;
      });
      return preset;
    },
    [filters],
  );

  const applyPreset = useCallback((preset: FilterPreset) => {
    setFiltersState((prev) => ({
      ...prev,
      ...preset.filters,
    }));
  }, []);

  const renamePreset = useCallback((id: string, newName: string) => {
    setPresetsState((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: newName } : p)),
    );
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresetsState((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return {
    filters,
    setFilters,
    clearFilters,
    availableOptions,
    advancedFilterCount,
    totalFilterCount,
    presets,
    savePreset,
    applyPreset,
    renamePreset,
    deletePreset,
  };
}
