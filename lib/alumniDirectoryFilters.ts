import { getStateNameByCode } from '@/lib/usStates';

/**
 * Escape `%` and `_` for PostgREST `ilike` filter values (wildcards).
 */
function escapeIlikeWildcards(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** PostgREST requires double quotes when the `ilike` pattern contains commas. */
function quoteIlikePattern(pattern: string): string {
  const p = escapeIlikeWildcards(pattern);
  if (p.includes(',') || p.includes('(') || p.includes(')')) return `"${p.replace(/"/g, '\\"')}"`;
  return p;
}

/**
 * PostgREST `or` on joined profile hometown text (`profile.hometown`).
 * Directory **work** location state uses `alumni.work_state_code` only (`lib/alumni/workStateCode.ts`).
 * Requires `profile:profiles!user_id!inner(...)` when this filter is applied.
 */
export function buildProfileHometownStateOrFilter(stateParam: string): string {
  const trimmed = stateParam.trim();
  if (!trimmed) return '';
  const code = trimmed.toUpperCase();
  const stateName = getStateNameByCode(code);
  const parts: string[] = [];

  if (stateName) {
    const namePat = quoteIlikePattern(`%${stateName}%`);
    if (code === 'VA') {
      parts.push(
        `and(profile.hometown.ilike.${namePat},profile.hometown.not.ilike.%West Virginia%)`
      );
    } else {
      parts.push(`profile.hometown.ilike.${namePat}`);
    }

    parts.push(`profile.hometown.ilike.${quoteIlikePattern(`%, ${code},%`)}`);
    parts.push(`profile.hometown.ilike.${quoteIlikePattern(`%, ${code} %`)}`);
    parts.push(`profile.hometown.ilike.${quoteIlikePattern(`%, ${code}`)}`);
  } else {
    parts.push(`profile.hometown.ilike.${quoteIlikePattern(`%, ${code},%`)}`);
    parts.push(`profile.hometown.ilike.${quoteIlikePattern(`%, ${code} %`)}`);
    parts.push(`profile.hometown.ilike.${quoteIlikePattern(`%, ${code}`)}`);
  }

  return parts.join(',');
}
