-- TRA-653: Canonical current location on public.alumni + sync from profiles (ADR 001)
-- Denormalized copy of profiles.current_place for directory / geo queries.
-- Legacy `alumni.location` TEXT unchanged for fallback until backfill.

ALTER TABLE public.alumni
  ADD COLUMN IF NOT EXISTS current_place jsonb;

COMMENT ON COLUMN public.alumni.current_place IS
  'Denormalized copy of profiles.current_place (CanonicalPlace). Kept in sync via trigger sync_alumni_current_place_from_profile.';

-- Sync: when profiles.current_place changes, push to matching alumni row (same user_id).
CREATE OR REPLACE FUNCTION public.sync_alumni_current_place_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.alumni a
  SET current_place = NEW.current_place
  WHERE a.user_id = NEW.id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_alumni_current_place_from_profile() IS
  'Copies profiles.current_place to alumni.current_place for rows with alumni.user_id = profiles.id. Application writes should still set both when upserting alumni for consistency on first insert.';

DROP TRIGGER IF EXISTS profiles_current_place_to_alumni ON public.profiles;

CREATE TRIGGER profiles_current_place_to_alumni
  AFTER INSERT OR UPDATE OF current_place ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_alumni_current_place_from_profile();
