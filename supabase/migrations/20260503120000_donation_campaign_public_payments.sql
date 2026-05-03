-- Public (Payment Link) guest payments for Stripe-backed donation drives.
-- Credited via checkout.session.completed when metadata marks payment_link_public
-- or when the session is tied to a known campaign Payment Link (legacy).

CREATE TABLE IF NOT EXISTS public.donation_campaign_public_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_campaign_id uuid NOT NULL REFERENCES public.donation_campaigns (id) ON DELETE CASCADE,
  stripe_checkout_session_id text NOT NULL,
  amount_paid_cents bigint NOT NULL CHECK (amount_paid_cents > 0),
  paid_at timestamptz NOT NULL,
  payer_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT donation_campaign_public_payments_session_unique UNIQUE (stripe_checkout_session_id)
);

CREATE INDEX IF NOT EXISTS donation_campaign_public_payments_campaign_idx
  ON public.donation_campaign_public_payments (donation_campaign_id);

COMMENT ON TABLE public.donation_campaign_public_payments IS
  'Stripe Checkout sessions from the campaign Payment Link (chapter hub / public); not tied to donation_campaign_recipients.';

ALTER TABLE public.donation_campaign_public_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "donation_campaign_public_payments_select_same_chapter"
  ON public.donation_campaign_public_payments;

CREATE POLICY "donation_campaign_public_payments_select_same_chapter"
  ON public.donation_campaign_public_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.donation_campaigns dc
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE dc.id = donation_campaign_public_payments.donation_campaign_id
        AND dc.chapter_id = p.chapter_id
    )
  );

GRANT SELECT ON public.donation_campaign_public_payments TO authenticated, service_role;
GRANT INSERT, DELETE ON public.donation_campaign_public_payments TO service_role;
