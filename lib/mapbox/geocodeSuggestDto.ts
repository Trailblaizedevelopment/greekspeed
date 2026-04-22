/**
 * Trimmed suggestion for autocomplete UI (not a full CanonicalPlace until confirm).
 */
export interface GeocodingSuggestion {
  mapbox_id: string;
  feature_type?: string;
  /** Primary label from Mapbox (e.g. place or address name). */
  name: string;
  /** Human-readable line for the list (place_formatted or full_address). */
  formatted_display: string;
  longitude: number | null;
  latitude: number | null;
}

interface MapboxGeocodeV6FeatureProperties {
  mapbox_id?: string;
  feature_type?: string;
  name?: string;
  name_preferred?: string;
  place_formatted?: string;
  full_address?: string;
  coordinates?: { longitude?: number; latitude?: number };
}

interface MapboxGeocodeV6Feature {
  geometry?: { coordinates?: [number, number] };
  properties?: MapboxGeocodeV6FeatureProperties;
}

export function mapGeocodeV6FeaturesToSuggestions(features: unknown[]): GeocodingSuggestion[] {
  const out: GeocodingSuggestion[] = [];
  for (const raw of features) {
    const f = raw as MapboxGeocodeV6Feature;
    const props = f.properties ?? {};
    const id = typeof props.mapbox_id === 'string' ? props.mapbox_id.trim() : '';
    if (!id) continue;

    const name =
      (typeof props.name_preferred === 'string' && props.name_preferred.trim()) ||
      (typeof props.name === 'string' && props.name.trim()) ||
      id;

    const formatted =
      (typeof props.place_formatted === 'string' && props.place_formatted.trim()) ||
      (typeof props.full_address === 'string' && props.full_address.trim()) ||
      name;

    const coords = props.coordinates;
    const geom = f.geometry?.coordinates;
    let longitude: number | null =
      typeof coords?.longitude === 'number' ? coords.longitude : null;
    let latitude: number | null = typeof coords?.latitude === 'number' ? coords.latitude : null;
    if (longitude === null && Array.isArray(geom) && geom.length >= 2) {
      longitude = geom[0];
      latitude = geom[1];
    }

    out.push({
      mapbox_id: id,
      feature_type: typeof props.feature_type === 'string' ? props.feature_type : undefined,
      name,
      formatted_display: formatted,
      longitude,
      latitude,
    });
  }
  return out;
}
