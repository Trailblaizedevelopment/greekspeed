-- TRA-652: Structured canonical location fields on public.profiles (ADR 001)
-- Adds JSONB for Mapbox-normalized "current" and "hometown" places.
-- Legacy TEXT columns `location` and `hometown` are NOT dropped; readers fall back until backfill.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_place jsonb,
  ADD COLUMN IF NOT EXISTS hometown_place jsonb;

COMMENT ON COLUMN public.profiles.current_place IS
  'CanonicalPlace JSON (docs/adr/001-canonical-profile-place.md). Structured current location; nullable until Mapbox picker backfill.';

COMMENT ON COLUMN public.profiles.hometown_place IS
  'CanonicalPlace JSON (docs/adr/001-canonical-profile-place.md). Structured hometown; nullable until Mapbox picker backfill.';
