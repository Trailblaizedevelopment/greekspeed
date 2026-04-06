-- =============================================================================
-- Read-only checks: Supabase Dashboard → SQL Editor
-- Run ONE block at a time (select the block, then Run). All blocks use pg_catalog
-- or information_schema available to the postgres role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BLOCK A — Triggers on public.profiles (primary check)
-- If this returns 0 rows: no custom triggers on profiles (good for chapter sync fear).
-- If rows exist: open trigger_definition and note the function name; inspect in Dashboard
-- Database → Functions, or run BLOCK C for that name only.
-- -----------------------------------------------------------------------------
SELECT
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'profiles'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- -----------------------------------------------------------------------------
-- BLOCK B — information_schema view (sometimes easier to read than pg_trigger)
-- -----------------------------------------------------------------------------
SELECT
  trigger_schema,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'profiles'
ORDER BY trigger_name;

-- -----------------------------------------------------------------------------
-- BLOCK C — Public functions whose *source* mentions chapter + profile-ish terms
-- Uses prosrc (body text) instead of pg_get_functiondef() in WHERE (avoids timeouts/errors).
-- Review any hits in Dashboard or: SELECT pg_get_functiondef('schema.name'::regproc);
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc IS NOT NULL
  AND p.prosrc ILIKE '%chapter%'
  AND (
    p.prosrc ILIKE '%profile%'
    OR p.prosrc ILIKE '%profiles%'
  )
ORDER BY p.proname;

-- -----------------------------------------------------------------------------
-- BLOCK D — Optional: marketing alumni rows (interpret with care; approved users have chapter_id)
-- -----------------------------------------------------------------------------
-- SELECT id, email, signup_channel, chapter, chapter_id, updated_at
-- FROM public.profiles
-- WHERE signup_channel = 'marketing_alumni'
-- ORDER BY updated_at DESC
-- LIMIT 25;
