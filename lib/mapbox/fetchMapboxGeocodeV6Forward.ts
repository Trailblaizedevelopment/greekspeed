import { MAPBOX_GEOCODE_V6_FORWARD_URL } from '@/lib/mapbox/constants';

/**
 * Calls Mapbox Geocoding v6 forward. The returned URL contains `access_token`;
 * never log the request URL or full `params.toString()`.
 */
export async function fetchMapboxGeocodeV6Forward(params: URLSearchParams): Promise<Response> {
  const url = `${MAPBOX_GEOCODE_V6_FORWARD_URL}?${params.toString()}`;
  return fetch(url, { method: 'GET', next: { revalidate: 0 } });
}
