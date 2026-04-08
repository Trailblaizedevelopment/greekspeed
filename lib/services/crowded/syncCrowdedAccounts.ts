import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrowdedAccount } from '@/types/crowded';
import {
  CrowdedApiError,
  type CrowdedClient,
  isCrowdedNoCustomerError,
} from './crowded-client';
import { getCrowdedIdsForTrailblaizeChapter } from './chapterCrowdedMapping';
import {
  mapCrowdedAccountToSyncFields,
  normalizeCrowdedAccountListElement,
} from './crowdedAccountMapping';

export type SyncCrowdedAccountsResult =
  | { ok: true; syncedCount: number; accounts: CrowdedAccount[] }
  | { ok: false; reason: 'no_mapping' }
  | { ok: false; reason: 'no_customer'; error: CrowdedApiError }
  | { ok: false; reason: 'db_error'; message: string }
  | { ok: false; reason: 'api_error'; error: unknown };

function toBigintOrNull(n: number | null | undefined): number | null {
  if (n === null || n === undefined) return null;
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export type UpsertCrowdedAccountsFromListResult =
  | { ok: true; syncedCount: number }
  | { ok: false; reason: 'db_error'; message: string };

/**
 * Upsert API account payloads into `public.crowded_accounts` (no Crowded HTTP calls).
 * Use after a successful `listAccounts` / `getAccount` when you already have `CrowdedAccount[]`.
 */
export async function upsertCrowdedAccountsFromList(
  supabase: SupabaseClient,
  trailblaizeChapterId: string,
  accounts: CrowdedAccount[]
): Promise<UpsertCrowdedAccountsFromListResult> {
  const list = Array.isArray(accounts)
    ? accounts
    : accounts != null && typeof accounts === 'object'
      ? [accounts as CrowdedAccount]
      : [];

  if (list.length === 0) {
    return { ok: true, syncedCount: 0 };
  }

  const nowIso = new Date().toISOString();
  const rows = list.map((account) => {
    const normalized = normalizeCrowdedAccountListElement(account as unknown);
    const fields = mapCrowdedAccountToSyncFields(trailblaizeChapterId, normalized);
    return {
      ...fields,
      balance_minor: toBigintOrNull(fields.balance_minor ?? undefined),
      hold_minor: toBigintOrNull(fields.hold_minor ?? undefined),
      available_minor: toBigintOrNull(fields.available_minor ?? undefined),
      last_synced_at: nowIso,
    };
  });

  const { error } = await supabase.from('crowded_accounts').upsert(rows, {
    onConflict: 'chapter_id,crowded_account_id',
  });

  if (error) {
    return { ok: false, reason: 'db_error', message: error.message };
  }

  return { ok: true, syncedCount: rows.length };
}

/**
 * TRA-412: List Crowded accounts for a chapter and upsert into `public.crowded_accounts`.
 * Uses `chapter_id` + `crowded_account_id` unique constraint. Requires service-role or bypass RLS for writes.
 *
 * @throws Does not throw — returns `{ ok: false, ... }` for API/DB errors except programmer errors.
 */
export async function syncCrowdedAccountsForTrailblaizeChapter(
  supabase: SupabaseClient,
  crowdedClient: CrowdedClient,
  trailblaizeChapterId: string
): Promise<SyncCrowdedAccountsResult> {
  const mapping = await getCrowdedIdsForTrailblaizeChapter(supabase, trailblaizeChapterId);
  if (!mapping) {
    return { ok: false, reason: 'no_mapping' };
  }

  let list: { data: CrowdedAccount[] };
  try {
    list = await crowdedClient.listAccounts(mapping.crowdedChapterId);
  } catch (e) {
    if (e instanceof CrowdedApiError && isCrowdedNoCustomerError(e)) {
      return { ok: false, reason: 'no_customer', error: e };
    }
    return { ok: false, reason: 'api_error', error: e };
  }

  const persist = await upsertCrowdedAccountsFromList(
    supabase,
    trailblaizeChapterId,
    list.data
  );
  if (!persist.ok) {
    return { ok: false, reason: 'db_error', message: persist.message };
  }

  return { ok: true, syncedCount: persist.syncedCount, accounts: list.data };
}

export type SyncSingleCrowdedAccountResult =
  | { ok: true; account: CrowdedAccount }
  | { ok: false; reason: 'no_customer'; error: CrowdedApiError }
  | { ok: false; reason: 'db_error'; message: string }
  | { ok: false; reason: 'api_error'; error: unknown };

/**
 * TRA-412: GET single account from Crowded and upsert one row into `crowded_accounts`.
 */
export async function syncCrowdedAccountByIds(
  supabase: SupabaseClient,
  crowdedClient: CrowdedClient,
  trailblaizeChapterId: string,
  crowdedChapterId: string,
  crowdedAccountId: string
): Promise<SyncSingleCrowdedAccountResult> {
  let res: { data: CrowdedAccount };
  try {
    res = await crowdedClient.getAccount(crowdedChapterId, crowdedAccountId);
  } catch (e) {
    if (e instanceof CrowdedApiError && isCrowdedNoCustomerError(e)) {
      return { ok: false, reason: 'no_customer', error: e };
    }
    return { ok: false, reason: 'api_error', error: e };
  }

  const persist = await upsertCrowdedAccountsFromList(supabase, trailblaizeChapterId, [res.data]);
  if (!persist.ok) {
    return { ok: false, reason: 'db_error', message: persist.message };
  }

  return { ok: true, account: res.data };
}
