-- TRA-631: Audit trail for in-app support requests (POST /api/support).
-- RLS enabled; no grants to anon/authenticated — only service_role (API) reads/writes.
-- Helps when outbound email fails: row still exists if insert runs after email (see app ordering).

CREATE TABLE IF NOT EXISTS public.support_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  chapter_id uuid NULL REFERENCES public.chapters (id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('question', 'bug', 'billing', 'other')),
  subject text NOT NULL,
  body text NOT NULL,
  reporter_email text NULL,
  page_url text NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_submissions IS 'In-app support form submissions for audit / recovery (TRA-631).';

CREATE INDEX IF NOT EXISTS idx_support_submissions_user_created
  ON public.support_submissions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_submissions_chapter_created
  ON public.support_submissions (chapter_id, created_at DESC)
  WHERE chapter_id IS NOT NULL;

ALTER TABLE public.support_submissions ENABLE ROW LEVEL SECURITY;

-- No policies: JWT clients cannot SELECT/INSERT/UPDATE/DELETE via PostgREST.
-- service_role bypasses RLS for server-side API.

REVOKE ALL ON TABLE public.support_submissions FROM PUBLIC;
GRANT ALL ON TABLE public.support_submissions TO service_role;
