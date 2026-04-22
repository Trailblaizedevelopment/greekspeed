# ADR 001: Canonical place shape (current location + hometown)

| Field | Value |
|--------|--------|
| **Status** | Accepted |
| **Date** | 2026-04-22 |
| **Ticket** | [TRA-651](https://linear.app/trailblaize/issue/TRA-651/adr-canonical-place-shape-for-current-location-hometown) |
| **Deciders** | Engineering (Trailblaize) |

## Context

- Today, `profiles.location` and `profiles.hometown` are free-text strings; `alumni.location` mirrors “current” loosely for alumni directory flows. Values are inconsistent (city only, state only, arbitrary formatting), which blocks reliable aggregates, filters, and future distance or map features.
- We are standardizing on **Mapbox Geocoding API v6** for forward search and persistence (`mapbox_id`, structured context, coordinates). See [Geocoding API](https://docs.mapbox.com/api/search/geocoding/) and [storing geocoding results](https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results) (`permanent=true` when results are stored long-term).

## Decision

1. Introduce a single **canonical JSON shape** — `CanonicalPlace` — for any saved geographic selection (whether “current location” or “hometown”). Two semantic uses, **same schema**:
   - **Current location** — where the member lives or works now; may change over time.
   - **Hometown** — stable origin for “from” style analytics; same fields as current.

2. **Primary storage** on `profiles`:
   - `current_place` (JSONB, nullable) — canonical object for current location.
   - `hometown_place` (JSONB, nullable) — canonical object for hometown.
   - Legacy columns `location` / `hometown` (TEXT) remain **during migration** for display fallback and backfill source; new writes should populate JSONB first, then optionally keep text in sync for older readers until deprecated (separate ticket).

3. **`alumni` table** — denormalized **current** place only for directory / chapter-scoped queries:
   - `current_place` (JSONB, nullable) **or** equivalent columns agreed in migration — must stay in sync with `profiles.current_place` when the user is alumni (single write path: application service or documented trigger; **no** independent free-text drift for geo).
   - **Hometown** remains profile-scoped unless product explicitly adds `hometown_place` to `alumni` later.

## CanonicalPlace schema (v1)

All keys are optional except where noted; omit unknown Mapbox context keys rather than inventing placeholders.

| Field | Type | Description |
|--------|------|-------------|
| `provider` | `string` | Fixed `"mapbox"` for v1. |
| `mapbox_id` | `string` | Stable feature id from Geocoding v6 (`properties.mapbox_id` / GeoJSON `id`). Required when row represents a user-confirmed selection. |
| `feature_type` | `string` | e.g. `country`, `region`, `postcode`, `district`, `place`, `locality`, `neighborhood`, `address` — mirrors Mapbox `feature_type`. |
| `country_code` | `string \| null` | ISO 3166-1 alpha-2 from `context.country.country_code`. |
| `region_code` | `string \| null` | Short code when present (e.g. `MD`). |
| `region_code_full` | `string \| null` | When present (e.g. `US-MD`). |
| `place_name` | `string \| null` | City / municipality name from `context.place.name`. |
| `locality_name` | `string \| null` | Sub-city official area when present. |
| `district_name` | `string \| null` | County / prefecture layer when present. |
| `postcode` | `string \| null` | Postal code when present. |
| `longitude` | `number \| null` | WGS84. From feature geometry / `properties.coordinates`. |
| `latitude` | `number \| null` | WGS84. |
| `formatted_display` | `string \| null` | Display-only string (`place_formatted` or `full_address` from Mapbox). |
| `worldview` | `string \| null` | Mapbox `worldview` query param used for resolution, if any. |
| `resolved_at` | `string` | ISO-8601 timestamp when this object was last confirmed / written. |

**Parsing rule:** Populate fields by mapping Mapbox Geocoding v6 `properties.context` and coordinates; do not guess missing admin levels from free text.

## Display and API rules

- **UI default label:** `formatted_display` if set; else compose from `place_name`, `region_code` / `region_name`, `country_code` in a small formatter util.
- **Legacy fallback:** If `current_place` / `hometown_place` is null, readers may fall back to `profiles.location` / `profiles.hometown` until backfill completes.
- **Alumni directory:** Prefer `alumni.current_place` (or synced JSON) for filters; stop relying on raw string `eq` for geo once structured fields exist.

## Non-goals (v1 of this ADR)

- POI-only picks (campuses, venues) via Mapbox Search Box — out of scope; may be ADR 002.
- PostGIS / geography columns — optional follow-up for DB-side distance.
- International address verification beyond what Geocoding returns for a given query.

## Consequences

- **Profiles migration (TRA-652):** `supabase/migrations/20260422140000_tra652_profiles_canonical_places.sql` adds `current_place` and `hometown_place` on `public.profiles`.
- **Alumni migration (TRA-653):** `supabase/migrations/20260422141000_tra653_alumni_current_place.sql` adds `alumni.current_place` and trigger `profiles_current_place_to_alumni` to copy `profiles.current_place` on insert/update of that column. New `alumni` rows should still be written with `current_place` from the app when available so the row is correct before any profile update.
- **TypeScript + Zod (TRA-654):** `types/canonicalPlace.ts` — `CanonicalPlace`, `canonicalPlaceSchema`, `canonicalPlaceConfirmedSchema`, parsers, `formatCanonicalPlaceDisplay`. `Profile` / `Alumni` types extended for `current_place` / `hometown_place` / `currentPlace`.
- Geocoding proxy (TRA-655 / TRA-656) should return and accept this shape (or a strict subset) after normalizing Mapbox responses server-side.

## References

- [Mapbox Geocoding API v6](https://docs.mapbox.com/api/search/geocoding/)
- [Geographic feature types](https://docs.mapbox.com/api/search/geocoding/#geographic-feature-types)
- [Storing geocoding results](https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results)
