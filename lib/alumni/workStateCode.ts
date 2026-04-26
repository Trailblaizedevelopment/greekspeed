import type { CanonicalPlace } from '@/types/canonicalPlace';
import { US_STATES } from '@/lib/usStates';

/** USPS-style codes we persist on `alumni.work_state_code` (US app). Includes DC. */
const VALID_CODES = new Set<string>([
  ...US_STATES.map((s) => s.code),
  'DC',
]);

const STATE_NAME_TO_CODE: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const s of US_STATES) {
    m.set(s.name.toLowerCase(), s.code);
    m.set(s.code.toLowerCase(), s.code);
  }
  m.set('district of columbia', 'DC');
  m.set('dc', 'DC');
  return m;
})();

const TRAILING_COUNTRY_SEGMENTS = new Set([
  'united states',
  'united states of america',
  'usa',
  'us',
  'u.s.',
  'u.s.a.',
]);

function lastMeaningfulLocationSegment(trimmed: string): string | null {
  const parts = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  let idx = parts.length - 1;
  let seg = parts[idx]!.toLowerCase();
  if (TRAILING_COUNTRY_SEGMENTS.has(seg) && idx >= 1) {
    idx -= 1;
    seg = parts[idx]!.toLowerCase();
  }
  return seg;
}

/**
 * Work-location state for directory filters: only trust Mapbox `region_code` when
 * the place is US (or country omitted) and the code is a known US subdivision code.
 */
export function deriveWorkStateCodeFromCanonicalPlace(
  place: CanonicalPlace | null | undefined
): string | null {
  if (!place) return null;
  const cc = (place.country_code ?? '').trim().toUpperCase();
  if (cc && cc !== 'US') return null;
  const raw = (place.region_code ?? '').trim().toUpperCase();
  if (raw.length !== 2) return null;
  return VALID_CODES.has(raw) ? raw : null;
}

/**
 * Best-effort state from a single-line location label (no `ilike` wildcards).
 * Uses the last comma segment, skipping trailing US country tokens (e.g. `, USA`).
 */
export function deriveWorkStateCodeFromLocationText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || /^not specified$/i.test(trimmed)) return null;

  const seg = lastMeaningfulLocationSegment(trimmed);
  if (!seg) return null;
  const byName = STATE_NAME_TO_CODE.get(seg);
  if (byName) return byName;
  if (seg.length === 2) {
    const up = seg.toUpperCase();
    return VALID_CODES.has(up) ? up : null;
  }
  return STATE_NAME_TO_CODE.get(trimmed.toLowerCase()) ?? null;
}

export function resolveAlumniWorkStateCode(input: {
  currentPlace: CanonicalPlace | null | undefined;
  locationLine: string | null | undefined;
}): string | null {
  return (
    deriveWorkStateCodeFromCanonicalPlace(input.currentPlace) ??
    deriveWorkStateCodeFromLocationText(input.locationLine)
  );
}
