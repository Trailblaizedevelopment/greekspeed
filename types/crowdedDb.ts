/**
 * Supabase row shapes for Crowded integration tables (TRA-410).
 * Inserts/updates from sync jobs should use the service role; reads may use the client with RLS.
 */

export interface CrowdedAccountRow {
  id: string;
  chapter_id: string;
  crowded_account_id: string;
  display_name: string | null;
  status: string | null;
  currency: string | null;
  crowded_contact_id: string | null;
  balance_minor: number | null;
  hold_minor: number | null;
  available_minor: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrowdedTransactionRow {
  id: string;
  chapter_id: string;
  crowded_account_id: string;
  crowded_transaction_id: string;
  amount_minor: number | null;
  currency: string | null;
  description: string | null;
  status: string | null;
  occurred_at: string | null;
  posted_at: string | null;
  synced_at: string;
  created_at: string;
  updated_at: string;
}
