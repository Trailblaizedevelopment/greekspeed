import {
  MAPBOX_GEOCODE_FEATURE_TYPES,
  type CanonicalPlace,
  type MapboxGeocodeFeatureType,
} from '@/types/canonicalPlace';

/** GeoJSON-ish feature from Mapbox Geocoding v6 forward response `features[]`. */
interface MapboxContextBlock {
  mapbox_id?: string;
  name?: string;
  country_code?: string;
  region_code?: string;
  region_code_full?: string;
}

interface MapboxGeocodeV6FeatureProperties {
  mapbox_id?: string;
  feature_type?: string;
  place_formatted?: string;
  full_address?: string;
  coordinates?: {
    longitude?: number;
    latitude?: number;
  };
  context?: {
    country?: MapboxContextBlock;
    region?: MapboxContextBlock;
    postcode?: MapboxContextBlock;
    district?: MapboxContextBlock;
    place?: MapboxContextBlock;
    locality?: MapboxContextBlock;
    neighborhood?: MapboxContextBlock;
  };
}

interface MapboxGeocodeV6Feature {
  type?: string;
  geometry?: {
    type?: string;
    coordinates?: [number, number];
  };
  properties?: MapboxGeocodeV6FeatureProperties;
}

function isMapboxGeocodeFeatureType(v: string): v is MapboxGeocodeFeatureType {
  return (MAPBOX_GEOCODE_FEATURE_TYPES as readonly string[]).includes(v);
}

/**
 * Maps the first (or chosen) Geocoding v6 feature into {@link CanonicalPlace} fields.
 * Caller must set `provider`, `resolved_at`, and run through Zod before treating as confirmed.
 */
export function mapGeocodeV6FeatureToCanonicalPlace(
  feature: MapboxGeocodeV6Feature,
  options: { worldview?: string | null }
): Omit<CanonicalPlace, 'provider' | 'resolved_at'> {
  const props = feature.properties ?? {};
  const ctx = props.context ?? {};
  const coords = props.coordinates;
  const geom = feature.geometry?.coordinates;

  let longitude: number | null | undefined =
    typeof coords?.longitude === 'number' ? coords.longitude : undefined;
  let latitude: number | null | undefined =
    typeof coords?.latitude === 'number' ? coords.latitude : undefined;
  if (longitude === undefined && Array.isArray(geom) && geom.length >= 2) {
    longitude = geom[0];
    latitude = geom[1];
  }

  const rawType = props.feature_type;
  const feature_type = typeof rawType === 'string' && isMapboxGeocodeFeatureType(rawType) ? rawType : undefined;

  const cc = ctx.country?.country_code;
  const country_code =
    typeof cc === 'string' && /^[A-Za-z]{2}$/.test(cc) ? cc.toUpperCase() : null;

  return {
    mapbox_id: typeof props.mapbox_id === 'string' ? props.mapbox_id : undefined,
    feature_type,
    country_code,
    region_code: typeof ctx.region?.region_code === 'string' ? ctx.region.region_code : null,
    region_code_full: typeof ctx.region?.region_code_full === 'string' ? ctx.region.region_code_full : null,
    place_name: typeof ctx.place?.name === 'string' ? ctx.place.name : null,
    locality_name: typeof ctx.locality?.name === 'string' ? ctx.locality.name : null,
    district_name: typeof ctx.district?.name === 'string' ? ctx.district.name : null,
    postcode: typeof ctx.postcode?.name === 'string' ? ctx.postcode.name : null,
    longitude: typeof longitude === 'number' ? longitude : null,
    latitude: typeof latitude === 'number' ? latitude : null,
    formatted_display:
      (typeof props.place_formatted === 'string' && props.place_formatted) ||
      (typeof props.full_address === 'string' && props.full_address) ||
      null,
    worldview: options.worldview?.trim() || null,
  };
}
