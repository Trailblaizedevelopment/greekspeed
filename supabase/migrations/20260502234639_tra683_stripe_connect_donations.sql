-- TRA-683: Stripe Connect donations — columns + webhook idempotency (no Stripe API calls required).
--
-- IMPORTANT: In this project `public.chapters` is a VIEW over `public.spaces` (security_invoker=true).
-- Stripe Connect columns live on `spaces`; the view is recreated to expose them as `chapters.*`.

-- ---------------------------------------------------------------------------
-- spaces (chapter rows): Connect account id + cached capability flags
-- ---------------------------------------------------------------------------
ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.spaces.stripe_connect_account_id IS 'Stripe Connect Express account id (acct_…) for chapter-scoped donations.';
COMMENT ON COLUMN public.spaces.stripe_connect_details_submitted IS 'Mirror of Stripe Account.details_submitted for onboarding UX.';
COMMENT ON COLUMN public.spaces.stripe_charges_enabled IS 'Mirror of Stripe Account.charges_enabled; treasurer gating before stripe_donations_enabled.';

-- ---------------------------------------------------------------------------
-- public.chapters: compatibility view (must list new columns from spaces)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.chapters
WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  description,
  location,
  member_count,
  founded_year,
  events,
  achievements,
  llm_enriched,
  llm_data,
  created_at,
  updated_at,
  university,
  slug,
  national_fraternity,
  chapter_name,
  school,
  school_location,
  chapter_status,
  starting_budget,
  feature_flags,
  crowded_chapter_id,
  crowded_organization_id,
  space_type,
  school_id,
  national_org_id,
  parent_chapter_id,
  stripe_connect_account_id,
  stripe_connect_details_submitted,
  stripe_charges_enabled
FROM public.spaces;

COMMENT ON VIEW public.chapters IS 'Chapter-shaped read model over public.spaces (includes Stripe Connect donation columns, TRA-683).';

-- Restore typical Supabase grants on the view (REPLACE can reset ACLs depending on PG version).
GRANT ALL PRIVILEGES ON public.chapters TO postgres;
GRANT ALL PRIVILEGES ON public.chapters TO anon;
GRANT ALL PRIVILEGES ON public.chapters TO authenticated;
GRANT ALL PRIVILEGES ON public.chapters TO service_role;

-- ---------------------------------------------------------------------------
-- donation_campaigns: Stripe Product/Price on connected account (Crowded uses crowded_*)
-- ---------------------------------------------------------------------------
ALTER TABLE public.donation_campaigns
  ADD COLUMN IF NOT EXISTS stripe_product_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

COMMENT ON COLUMN public.donation_campaigns.stripe_product_id IS 'Stripe Product id (created on connected account) when campaign is Stripe-backed.';
COMMENT ON COLUMN public.donation_campaigns.stripe_price_id IS 'Stripe Price id for Checkout line items when campaign is Stripe-backed.';

-- ---------------------------------------------------------------------------
-- donation_campaign_recipients: Checkout URLs + webhook settlement
-- ---------------------------------------------------------------------------
ALTER TABLE public.donation_campaign_recipients
  ADD COLUMN IF NOT EXISTS stripe_checkout_url text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS amount_paid_cents bigint;

COMMENT ON COLUMN public.donation_campaign_recipients.stripe_checkout_url IS 'Stripe Checkout Session URL for this recipient (destination charges to chapter Connect account).';
COMMENT ON COLUMN public.donation_campaign_recipients.stripe_checkout_session_id IS 'Stripe Checkout Session id (cs_…) for support and idempotent webhook handling.';
COMMENT ON COLUMN public.donation_campaign_recipients.paid_at IS 'When payment succeeded (Crowded or Stripe pipeline).';
COMMENT ON COLUMN public.donation_campaign_recipients.amount_paid_cents IS 'Settled amount in minor units when paid.';

-- Stripe-backed rows do not require a Crowded contact id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'donation_campaign_recipients'
      AND column_name = 'crowded_contact_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.donation_campaign_recipients
      ALTER COLUMN crowded_contact_id DROP NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- stripe_webhook_events: idempotency (insert before side effects; unique on event id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_webhook_events_stripe_event_id_key UNIQUE (stripe_event_id)
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_received_at_idx
  ON public.stripe_webhook_events (received_at DESC);

COMMENT ON TABLE public.stripe_webhook_events IS 'One row per processed Stripe webhook event id — duplicate deliveries are ignored (TRA-683 / TRA-689).';

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Client roles must not read/write; Next.js webhook uses SUPABASE_SERVICE_ROLE_KEY.
REVOKE ALL ON public.stripe_webhook_events FROM anon;
REVOKE ALL ON public.stripe_webhook_events FROM authenticated;
GRANT ALL ON public.stripe_webhook_events TO service_role;
