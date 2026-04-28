-- OpenAlex institution id (e.g. I93320256) for deduping user-imported schools from public search.
-- Run in Supabase SQL editor (or your migration runner) before using POST /api/schools/materialize.

ALTER TABLE public.schools
ADD COLUMN IF NOT EXISTS openalex_id text;

CREATE UNIQUE INDEX IF NOT EXISTS schools_openalex_id_uidx
ON public.schools (openalex_id)
WHERE openalex_id IS NOT NULL;
