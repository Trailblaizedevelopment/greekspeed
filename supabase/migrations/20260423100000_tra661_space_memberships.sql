-- TRA-661: Multi-space membership table, RLS, and backfill
-- Allows one user to belong to multiple chapters/spaces.

-- 1. Create space_memberships table
CREATE TABLE IF NOT EXISTS public.space_memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  space_id   UUID NOT NULL,
  role       TEXT NOT NULL DEFAULT 'active_member',
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'alumni', 'inactive')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one membership row per user+space (for non-inactive rows)
CREATE UNIQUE INDEX IF NOT EXISTS uq_space_memberships_user_space
  ON public.space_memberships (user_id, space_id)
  WHERE status != 'inactive';

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_space_memberships_user_id
  ON public.space_memberships (user_id);

-- Fast lookup by space
CREATE INDEX IF NOT EXISTS idx_space_memberships_space_id
  ON public.space_memberships (space_id);

-- At most one primary per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_space_memberships_primary
  ON public.space_memberships (user_id)
  WHERE is_primary = true;

-- 2. RLS policies
ALTER TABLE public.space_memberships ENABLE ROW LEVEL SECURITY;

-- Users can read their own memberships
CREATE POLICY "Users can read own memberships"
  ON public.space_memberships
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (API routes use service role key)
CREATE POLICY "Service role full access"
  ON public.space_memberships
  FOR ALL
  USING (auth.role() = 'service_role');

-- 3. Backfill: for every profile with non-null chapter_id, insert membership row (idempotent)
INSERT INTO public.space_memberships (user_id, space_id, role, status, is_primary, created_at, updated_at)
SELECT
  p.id AS user_id,
  p.chapter_id AS space_id,
  COALESCE(p.role, 'active_member') AS role,
  CASE
    WHEN p.role = 'alumni' THEN 'alumni'
    ELSE 'active'
  END AS status,
  true AS is_primary,
  COALESCE(p.created_at, now()) AS created_at,
  now() AS updated_at
FROM public.profiles p
WHERE p.chapter_id IS NOT NULL
ON CONFLICT DO NOTHING;
