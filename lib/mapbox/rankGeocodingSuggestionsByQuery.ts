import type { GeocodingSuggestion } from '@/lib/mapbox/geocodeSuggestDto';

/**
 * US state / DC names as Mapbox often returns them as a 2-segment `place` ("Florida, United States"),
 * which is poor for hometown city autocomplete when the user typed a city name.
 */
const US_ADMIN_AREA_SINGLE_SEGMENT = new Set<string>([
  'alabama',
  'alaska',
  'arizona',
  'arkansas',
  'california',
  'colorado',
  'connecticut',
  'delaware',
  'district of columbia',
  'florida',
  'georgia',
  'hawaii',
  'idaho',
  'illinois',
  'indiana',
  'iowa',
  'kansas',
  'kentucky',
  'louisiana',
  'maine',
  'maryland',
  'massachusetts',
  'michigan',
  'minnesota',
  'mississippi',
  'missouri',
  'montana',
  'nebraska',
  'nevada',
  'new hampshire',
  'new jersey',
  'new mexico',
  'new york',
  'north carolina',
  'north dakota',
  'ohio',
  'oklahoma',
  'oregon',
  'pennsylvania',
  'rhode island',
  'south carolina',
  'south dakota',
  'tennessee',
  'texas',
  'utah',
  'vermont',
  'virginia',
  'washington',
  'west virginia',
  'wisconsin',
  'wyoming',
]);

/**
 * True when `formatted_display` is only "{US state or DC}, United States" (or USA) and `q`
 * does not appear to be choosing that area (so we drop the row before ranking).
 */
function isUsStateOrDcOnlyRow(formattedLower: string, q: string): boolean {
  const t = formattedLower.trim();
  const m = t.match(/^(.+),\s*(united states|usa)$/);
  if (!m) return false;
  const before = m[1].trim();
  /** City, state, country — keep (e.g. "Tampa, Florida, United States"). */
  if (before.includes(',')) return false;
  if (!US_ADMIN_AREA_SINGLE_SEGMENT.has(before)) return false;
  if (before === q) return false;
  /** User is typing the state / DC name — keep the row. */
  if (before.includes(q) || before.startsWith(q)) return false;
  if (q.length >= 2 && before.startsWith(q.slice(0, Math.min(4, q.length)))) return false;
  return true;
}

/**
 * Re-ranks Mapbox suggest results so the user's query `q` surfaces city-like rows
 * (e.g. "Tampa, Florida…") ahead of unrelated "State, United States" `place` rows
 * when Mapbox's default relevance order is noisy.
 */
export function rankGeocodingSuggestionsByQuery(
  suggestions: GeocodingSuggestion[],
  rawQuery: string
): GeocodingSuggestion[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q || suggestions.length === 0) return suggestions;

  const digitQuery = /^\d/.test(q);
  let working = suggestions;
  if (!digitQuery) {
    working = suggestions.filter((s) => {
      const fd = s.formatted_display.trim().toLowerCase();
      if (isUsStateOrDcOnlyRow(fd, q)) return false;
      if (isStateCountryOnlyRow(fd, q)) return false;
      return true;
    });
  }

  return rankOnly(working, q);
}

function rankOnly(suggestions: GeocodingSuggestion[], q: string): GeocodingSuggestion[] {
  const scored = suggestions.map((s, index) => ({ s, index, score: matchScore(s, q) }));
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.index - b.index;
  });
  return scored.map((x) => x.s);
}

/**
 * Adds to match score (lower is better): for alphabetic queries, prefer `place` / `locality`
 * over streets and addresses so lists feel like the Mapbox city demo while still returning
 * broader `types` from Mapbox.
 */
function featureTypeSortBias(featureType: string | undefined, q: string): number {
  const t = (featureType ?? '').toLowerCase();
  if (/^\d/.test(q)) {
    if (t === 'postcode' || t === 'place' || t === 'locality' || t === 'address' || t === 'street') return 0;
    if (t === 'neighborhood' || t === 'district') return 2;
    return 4;
  }
  if (t === 'place' || t === 'locality') return 0;
  if (t === 'neighborhood' || t === 'district') return 5;
  if (t === 'postcode' || t === 'region') return 8;
  if (t === 'address' || t === 'street' || t === 'block' || t === 'secondary_address') return 20;
  return 6;
}

function matchScore(s: GeocodingSuggestion, q: string): number {
  const name = s.name.trim().toLowerCase();
  const fd = s.formatted_display.trim().toLowerCase();
  const firstSeg = (fd.split(',')[0] ?? '').trim();
  const bias = featureTypeSortBias(s.feature_type, q);

  if (/^\d/.test(q)) {
    if (name.startsWith(q) || fd.startsWith(q)) return 0 + bias;
    if (name.includes(q) || fd.includes(q)) return 4 + bias;
    return 12 + bias;
  }

  if (name === q) return 0 + bias;
  if (firstSeg === q) return 1 + bias;
  if (name.startsWith(q)) return 2 + bias;
  if (firstSeg.startsWith(q)) return 3 + bias;
  if (name.includes(q)) return 6 + bias;
  if (fd.includes(q)) return 8 + bias;

  if (isStateCountryOnlyRow(fd, q)) return 85 + bias;

  return 40 + bias;
}

/**
 * "Florida, United States" style rows where the leading segment does not relate to `q`
 * (e.g. query "tampa" vs state name "florida").
 */
function isStateCountryOnlyRow(fd: string, q: string): boolean {
  const parts = fd.split(',').map((p) => p.trim().toLowerCase());
  if (parts.length !== 2) return false;
  if (parts[1] !== 'united states') return false;
  const main = parts[0];
  if (!main) return false;
  if (main.startsWith(q) || main.includes(q)) return false;
  if (q.startsWith(main.slice(0, Math.min(3, main.length)))) return false;
  return true;
}
