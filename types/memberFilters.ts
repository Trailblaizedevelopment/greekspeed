import type { ChapterRole } from '@/types/profile';

export interface MemberSearchFilters {
  searchTerm: string;
  section: string;
  graduationYear: string | null;
  major: string | null;
  location: string | null;
  chapterRole: ChapterRole | null;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: Omit<MemberSearchFilters, 'searchTerm'>;
  createdAt: string;
}

export const DEFAULT_MEMBER_FILTERS: MemberSearchFilters = {
  searchTerm: '',
  section: 'all',
  graduationYear: null,
  major: null,
  location: null,
  chapterRole: null,
};

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface AvailableFilterOptions {
  graduationYears: FilterOption[];
  majors: FilterOption[];
  locations: FilterOption[];
  chapterRoles: FilterOption[];
}
