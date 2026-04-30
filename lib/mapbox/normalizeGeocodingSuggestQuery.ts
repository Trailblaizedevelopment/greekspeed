/**
 * Mapbox forward relevance improves for city-style strings when commas are normalized
 * (e.g. "Austin, texas" → "Austin texas").
 */
export function normalizeGeocodingSuggestQueryForMapbox(q: string): string {
  return q
    .trim()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
