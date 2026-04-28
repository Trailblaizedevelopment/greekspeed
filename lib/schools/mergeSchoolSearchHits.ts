import type { SchoolSearchHit } from '@/lib/schools/types';

function normName(h: SchoolSearchHit): string {
  return h.name.trim().toLowerCase();
}

/** Prefer local (`database`) rows; append OpenAlex hits that are not already matched by name. */
export function mergeSchoolSearchHits(
  local: SchoolSearchHit[],
  remote: SchoolSearchHit[],
  maxTotal: number,
): SchoolSearchHit[] {
  const seen = new Set<string>();
  const out: SchoolSearchHit[] = [];
  for (const h of local) {
    const k = normName(h);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
    if (out.length >= maxTotal) return out;
  }
  for (const h of remote) {
    if (out.length >= maxTotal) break;
    const k = normName(h);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}
