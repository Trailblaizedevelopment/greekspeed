import type { Chapter } from '@/types/chapter';

export type NationalOrgDirectoryPick = {
  id: string;
  name: string;
  short_name?: string | null;
};

/** Narrow chapter directory rows by linked national org UUID or name overlap on `national_fraternity`. */
export function chapterMatchesNationalOrgDirectory(
  ch: Chapter,
  org: NationalOrgDirectoryPick,
): boolean {
  if (ch.national_organization_id && ch.national_organization_id === org.id) return true;
  const needle = org.name.trim().toLowerCase();
  if (!needle) return true;
  const short = (org.short_name ?? '').trim().toLowerCase();
  const nf = (ch.national_fraternity ?? '').toLowerCase();
  if (nf.includes(needle)) return true;
  if (short && nf.includes(short)) return true;
  return false;
}
