/** Row in `donation_campaign_public_payments` (guest / Payment Link checkouts). */
export interface DonationCampaignPublicPaymentRow {
  id: string;
  donation_campaign_id: string;
  stripe_checkout_session_id: string;
  amount_paid_cents: number;
  paid_at: string;
  payer_email: string | null;
  created_at: string;
}
