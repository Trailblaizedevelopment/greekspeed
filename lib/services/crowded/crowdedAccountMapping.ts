import type { CrowdedAccount } from '@/types/crowded';

/**
 * Fields for upserting `public.crowded_accounts` from a Crowded account payload (excluding PK and timestamps).
 * Confirm amount units match Crowded (typically minor units) before relying on balances in production.
 */
export interface CrowdedAccountSyncFields {
  chapter_id: string;
  crowded_account_id: string;
  display_name: string | null;
  status: string | null;
  currency: string | null;
  crowded_contact_id: string | null;
  balance_minor: number | null;
  hold_minor: number | null;
  available_minor: number | null;
}

export function mapCrowdedAccountToSyncFields(
  trailblaizeChapterId: string,
  account: CrowdedAccount
): CrowdedAccountSyncFields {
  return {
    chapter_id: trailblaizeChapterId,
    crowded_account_id: account.id,
    display_name: account.name ?? null,
    status: account.status ?? null,
    currency: account.currency ?? null,
    crowded_contact_id: account.contactId ?? null,
    balance_minor: account.balance ?? null,
    hold_minor: account.hold ?? null,
    available_minor: account.available ?? null,
  };
}
