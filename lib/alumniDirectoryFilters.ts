import { getStateNameByCode } from '@/lib/usStates';

/**
 * PostgREST `or` clause: match a US state against free-text `alumni.location`
 * (e.g. "Tampa, Florida, United States"). Uses 2-letter code + full state name
 * `ilike` only — no JSON / Mapbox / `current_place` fields.
 */
export function buildAlumniLocationStateOrFilter(stateParam: string): string {
  const trimmed = stateParam.trim();
  if (!trimmed) return '';
  const code = trimmed.toUpperCase();
  const stateName = getStateNameByCode(code);
  if (stateName) {
    return `location.ilike.%${code}%,location.ilike.%${stateName}%`;
  }
  return `location.ilike.%${code}%`;
}

/**
 * PostgREST `or` on joined profile hometown text (`select` embed alias `profile`,
 * column `hometown` on `profiles`). Same ilike patterns as `alumni.location`.
 * Requires `profile:profiles!user_id!inner(...)` in `select` so filters apply to
 * parent rows. Does not read `hometown_place` JSON.
 */
export function buildProfileHometownStateOrFilter(stateParam: string): string {
  const trimmed = stateParam.trim();
  if (!trimmed) return '';
  const code = trimmed.toUpperCase();
  const stateName = getStateNameByCode(code);
  if (stateName) {
    return `profile.hometown.ilike.%${code}%,profile.hometown.ilike.%${stateName}%`;
  }
  return `profile.hometown.ilike.%${code}%`;
}
