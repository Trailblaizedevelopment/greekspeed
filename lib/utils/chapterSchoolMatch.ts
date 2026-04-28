import type { Chapter } from '@/types/chapter';

export type SchoolDirectoryPick = {
  id: string;
  name: string;
  short_name?: string | null;
};

/** Narrow chapter directory rows to those likely tied to the selected canonical school. */
export function chapterMatchesSchoolDirectory(ch: Chapter, school: SchoolDirectoryPick): boolean {
  const needle = school.name.trim().toLowerCase();
  if (!needle) return true;
  const short = (school.short_name ?? '').trim().toLowerCase();
  const blob = `${(ch.university ?? '').toLowerCase()} ${(ch.school ?? '').toLowerCase()}`;
  if (blob.includes(needle)) return true;
  if (short && blob.includes(short)) return true;
  return false;
}
