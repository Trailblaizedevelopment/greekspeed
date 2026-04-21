-- Audience visibility for chapter events (TRA-643)
-- Idempotent: safe if columns already exist (e.g. applied via dashboard/MCP first).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS visible_to_active_members boolean NOT NULL DEFAULT true;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS visible_to_alumni boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_audience_at_least_one'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_audience_at_least_one
      CHECK (visible_to_active_members OR visible_to_alumni);
  END IF;
END $$;

COMMENT ON COLUMN public.events.visible_to_active_members IS 'When true, chapter members with member_status=active may see this event in chapter-scoped UIs.';
COMMENT ON COLUMN public.events.visible_to_alumni IS 'When true, chapter members with member_status=alumni may see this event in chapter-scoped UIs.';
