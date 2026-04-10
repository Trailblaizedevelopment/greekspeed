import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrowdedClient } from './crowded-client';
import { syncCrowdedAccountsForTrailblaizeChapter } from './syncCrowdedAccounts';
import {
  buildSyntheticCollectTransactionId,
  extractCrowdedAccountIdFromPayload,
  extractCrowdedPaymentTransactionIdFromPayload,
  resolveCrowdedAccountIdForCollectEvent,
} from './crowdedTransactionMapping';

export type UpsertCollectCrowdedTransactionResult =
  | { ok: true }
  | { ok: false; skipped: true; reason: string };

/**
 * Upsert one `crowded_transactions` row for Collect payment webhooks (TRA-418).
 * Refreshes `crowded_accounts` first so composite FK is satisfied.
 */
export async function upsertCrowdedTransactionForCollectWebhook(params: {
  supabase: SupabaseClient;
  crowded: CrowdedClient;
  trailblaizeChapterId: string;
  parsed: Record<string, unknown>;
  collectionId: string;
  contactId: string;
  amountMinor: number | null;
  status: 'succeeded' | 'failed';
}): Promise<UpsertCollectCrowdedTransactionResult> {
  const {
    supabase,
    crowded,
    trailblaizeChapterId,
    parsed,
    collectionId,
    contactId,
    amountMinor,
    status,
  } = params;

  const sync = await syncCrowdedAccountsForTrailblaizeChapter(
    supabase,
    crowded,
    trailblaizeChapterId
  );
  if (!sync.ok) {
    if (sync.reason === 'no_mapping') {
      return { ok: false, skipped: true, reason: 'no chapter mapping for crowded accounts' };
    }
    if (sync.reason === 'no_customer') {
      return { ok: false, skipped: true, reason: 'NO_CUSTOMER from Crowded accounts list' };
    }
    if (sync.reason === 'db_error') {
      return { ok: false, skipped: true, reason: `crowded_accounts sync: ${sync.message}` };
    }
    return { ok: false, skipped: true, reason: 'could not sync crowded_accounts' };
  }

  const payloadAccountId = extractCrowdedAccountIdFromPayload(parsed);
  const crowdedAccountId = resolveCrowdedAccountIdForCollectEvent(
    sync.accounts,
    contactId,
    payloadAccountId
  );
  if (!crowdedAccountId) {
    return { ok: false, skipped: true, reason: 'could not resolve crowded_account_id' };
  }

  let crowdedTransactionId = extractCrowdedPaymentTransactionIdFromPayload(parsed);
  if (!crowdedTransactionId) {
    crowdedTransactionId = buildSyntheticCollectTransactionId(
      collectionId,
      contactId,
      amountMinor,
      status
    );
  }

  const now = new Date().toISOString();
  const row = {
    chapter_id: trailblaizeChapterId,
    crowded_account_id: crowdedAccountId,
    crowded_transaction_id: crowdedTransactionId,
    amount_minor: amountMinor,
    currency: 'USD',
    description:
      status === 'succeeded'
        ? `Collect payment (collection ${collectionId})`
        : `Collect payment failed (collection ${collectionId})`,
    status,
    occurred_at: now,
    posted_at: null as string | null,
    synced_at: now,
    updated_at: now,
  };

  const { error } = await supabase.from('crowded_transactions').upsert(row, {
    onConflict: 'chapter_id,crowded_account_id,crowded_transaction_id',
  });

  if (error) {
    console.error('crowded_transactions upsert (Collect webhook):', error);
    return { ok: false, skipped: true, reason: error.message };
  }

  return { ok: true };
}
