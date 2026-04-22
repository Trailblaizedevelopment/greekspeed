import type { GeocodingSuggestion } from '@/lib/mapbox/geocodeSuggestDto';

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
  if (!q || suggestions.length <= 1) return suggestions;

  const scored = suggestions.map((s, index) => ({ s, index, score: matchScore(s, q) }));
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.index - b.index;
  });
  return scored.map((x) => x.s);
}

function matchScore(s: GeocodingSuggestion, q: string): number {
  const name = s.name.trim().toLowerCase();
  const fd = s.formatted_display.trim().toLowerCase();
  const firstSeg = (fd.split(',')[0] ?? '').trim();

  if (/^\d/.test(q)) {
    if (name.startsWith(q) || fd.startsWith(q)) return 0;
    if (name.includes(q) || fd.includes(q)) return 4;
    return 12;
  }

  if (name === q) return 0;
  if (firstSeg === q) return 1;
  if (name.startsWith(q)) return 2;
  if (firstSeg.startsWith(q)) return 3;
  if (name.includes(q)) return 6;
  if (fd.includes(q)) return 8;

  if (isStateCountryOnlyRow(fd, q)) return 85;

  return 40;
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
