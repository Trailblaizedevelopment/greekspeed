-- TRA-662: Multi-platform social profile links
-- Creates profile_social_links table, backfills existing linkedin_url data,
-- and adds RLS policies for owner-managed links with public read access.

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.profile_social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'x', 'linkedin', 'tiktok', 'youtube', 'website', 'other')),
  url text NOT NULL,
  handle text,
  label text,
  sort_order int NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Unique constraint to prevent duplicate platform+url per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_social_links_user_platform_url
  ON public.profile_social_links (user_id, platform, url);

-- 3. Index for efficient sorted reads
CREATE INDEX IF NOT EXISTS idx_profile_social_links_user_sort
  ON public.profile_social_links (user_id, sort_order);

-- 4. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_profile_social_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profile_social_links_updated_at ON public.profile_social_links;
CREATE TRIGGER trg_profile_social_links_updated_at
  BEFORE UPDATE ON public.profile_social_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_social_links_updated_at();

-- 5. Enable RLS
ALTER TABLE public.profile_social_links ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- Anyone can read visible links (matches public profile visibility model)
CREATE POLICY "Anyone can read visible social links"
  ON public.profile_social_links
  FOR SELECT
  USING (is_visible = true);

-- Owners can read all their own links (including hidden)
CREATE POLICY "Owners can read own social links"
  ON public.profile_social_links
  FOR SELECT
  USING (auth.uid() = user_id);

-- Owners can insert their own links
CREATE POLICY "Owners can insert own social links"
  ON public.profile_social_links
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Owners can update their own links
CREATE POLICY "Owners can update own social links"
  ON public.profile_social_links
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Owners can delete their own links
CREATE POLICY "Owners can delete own social links"
  ON public.profile_social_links
  FOR DELETE
  USING (auth.uid() = user_id);

-- 7. Idempotent backfill: migrate existing linkedin_url into social links
INSERT INTO public.profile_social_links (user_id, platform, url, sort_order, is_visible)
SELECT
  p.id,
  'linkedin',
  p.linkedin_url,
  0,
  true
FROM public.profiles p
WHERE p.linkedin_url IS NOT NULL
  AND p.linkedin_url != ''
ON CONFLICT (user_id, platform, url) DO NOTHING;
