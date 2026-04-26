import type { GeocodingSuggestion } from '@/lib/mapbox/geocodeSuggestDto';

/**
 * Drop obviously wrong Mapbox picks when forward-geocoding free-text `alumni.location`
 * (systematic street/MS-route collisions seen after bulk backfill).
 */
export function shouldRejectGeocodeSuggestionForLocationQuery(
  rawQuery: string,
  suggestion: GeocodingSuggestion
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const fd = suggestion.formatted_display.trim().toLowerCase();
  const name = suggestion.name.trim().toLowerCase();
  const blob = `${fd} ${name}`;

  const mentions = (s: string) => q.includes(s);

  /** Texarkana, TX 75501-style false positives for major TX metros. */
  if (
    (mentions('dallas') ||
      mentions('houston') ||
      mentions('tyler') ||
      mentions('fort worth') ||
      mentions('austin') ||
      mentions('lubbock') ||
      mentions('plano') ||
      mentions('southlake') ||
      mentions('mckinney') ||
      mentions('frisco') ||
      mentions('sugar land') ||
      mentions('college station')) &&
    (blob.includes('texarkana') || name === 'texarkana')
  ) {
    return true;
  }

  /** "Jackson, MS" → Michigan City, MS (MS highway / street named Jackson). */
  if (
    mentions('jackson') &&
    (mentions(', ms') || mentions(' ms') || mentions('mississippi')) &&
    blob.includes('michigan city')
  ) {
    return true;
  }

  /** Natchez, MS → Pontotoc street hits. */
  if (mentions('natchez') && blob.includes('pontotoc')) {
    return true;
  }

  /** Silverthorne, CO → wrong US hits (do not use bare `co` — substring noise). */
  if (
    mentions('silverthorne') &&
    (mentions('colorado') || /,\s*co\b/i.test(q)) &&
    blob.includes('arden hills')
  ) {
    return true;
  }

  return false;
}
