import type { GeocodingSuggestion } from '@/lib/mapbox/geocodeSuggestDto';

function normalizeDisplayKey(formattedDisplay: string): string {
  return formattedDisplay.trim().toLowerCase();
}

/**
 * Lower = preferred when several Mapbox features share the same `formatted_display`.
 * Digit-led queries prefer postcode / address-like rows; text queries prefer place-like rows.
 */
function featureTypeDedupePriority(featureType: string | undefined, digitQuery: boolean): number {
  const t = (featureType ?? '').toLowerCase();
  if (digitQuery) {
    if (t === 'postcode') return 0;
    if (t === 'address') return 1;
    if (t === 'street' || t === 'block' || t === 'secondary_address') return 2;
    if (t === 'place' || t === 'locality') return 3;
    if (t === 'neighborhood') return 4;
    if (t === 'district') return 5;
    if (t === 'region') return 6;
    if (t === 'country') return 7;
    return 50;
  }
  if (t === 'place') return 0;
  if (t === 'locality') return 1;
  if (t === 'postcode') return 2;
  if (t === 'neighborhood') return 3;
  if (t === 'district') return 4;
  if (t === 'region') return 5;
  if (t === 'country') return 6;
  if (t === 'address') return 10;
  if (t === 'street' || t === 'block' || t === 'secondary_address') return 11;
  return 50;
}

type IndexedSuggestion = { suggestion: GeocodingSuggestion; index: number };

function pickWinnerForKey(entries: IndexedSuggestion[], digitQuery: boolean): GeocodingSuggestion {
  let best = entries[0]!;
  let bestPri = featureTypeDedupePriority(best.suggestion.feature_type, digitQuery);
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i]!;
    const pri = featureTypeDedupePriority(e.suggestion.feature_type, digitQuery);
    if (pri < bestPri || (pri === bestPri && e.index < best.index)) {
      best = e;
      bestPri = pri;
    }
  }
  return best.suggestion;
}

/**
 * Collapses rows that share the same human-visible line (`formatted_display`, normalized).
 * The kept row is chosen by feature-type priority (place / locality ahead of neighborhood /
 * district / region, etc.), then by earlier position in `ranked` (your match order).
 * Stored `mapbox_id` / coordinates remain whatever feature wins — the user still picks explicitly on confirm.
 */
export function dedupeGeocodingSuggestionsByFormattedDisplay(
  ranked: GeocodingSuggestion[],
  rawQuery: string
): GeocodingSuggestion[] {
  if (ranked.length <= 1) return ranked;

  const digitQuery = /^\d/.test(rawQuery.trim());
  const groups = new Map<string, IndexedSuggestion[]>();

  ranked.forEach((suggestion, index) => {
    const key = normalizeDisplayKey(suggestion.formatted_display);
    if (!key) return;
    const list = groups.get(key);
    const entry: IndexedSuggestion = { suggestion, index };
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  });

  const winnerByKey = new Map<string, GeocodingSuggestion>();
  for (const [key, entries] of groups) {
    if (entries.length === 1) {
      winnerByKey.set(key, entries[0]!.suggestion);
    } else {
      winnerByKey.set(key, pickWinnerForKey(entries, digitQuery));
    }
  }

  const out: GeocodingSuggestion[] = [];
  const emitted = new Set<string>();

  for (const suggestion of ranked) {
    const key = normalizeDisplayKey(suggestion.formatted_display);
    if (!key) {
      out.push(suggestion);
      continue;
    }
    const winner = winnerByKey.get(key);
    if (!winner) {
      out.push(suggestion);
      continue;
    }
    if (suggestion !== winner) continue;
    if (emitted.has(key)) continue;
    out.push(suggestion);
    emitted.add(key);
  }

  return out;
}
