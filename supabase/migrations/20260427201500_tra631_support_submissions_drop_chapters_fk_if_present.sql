-- TRA-631 repair: drop legacy FK to public.chapters if present; add chapter_name if missing.
-- Run after 20260427200000 if you had an older definition. No-op when table does not exist.

DO $$
BEGIN
  IF to_regclass('public.support_submissions') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.support_submissions
    DROP CONSTRAINT IF EXISTS support_submissions_chapter_id_fkey;

  ALTER TABLE public.support_submissions
    ADD COLUMN IF NOT EXISTS chapter_name text NULL;
END $$;
