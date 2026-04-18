-- TRA-630: per-user cooldown for POST /api/support (server uses service role; RLS blocks anon/auth direct access)

CREATE TABLE IF NOT EXISTS public.support_submission_rate (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  last_submitted_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_submission_rate IS 'Last successful in-app support submission per user for rate limiting (TRA-630).';

CREATE INDEX IF NOT EXISTS idx_support_submission_rate_last_at
  ON public.support_submission_rate (last_submitted_at);

ALTER TABLE public.support_submission_rate ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.support_submission_rate FROM PUBLIC;
GRANT ALL ON TABLE public.support_submission_rate TO service_role;
