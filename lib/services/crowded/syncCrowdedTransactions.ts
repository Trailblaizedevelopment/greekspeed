import type { SupabaseClient } from '@supabase/supabase-js';
import { CrowdedApiError, type CrowdedClient } from './crowded-client';
import { resolveCrowdedAccountApiId } from './crowdedAccountMapping';
import {
  mapCrowdedApiTransactionToUpsertRow,
  normalizeCrowdedTransactionListElement,
} from './crowdedTransactionMapping';
import { syncCrowdedAccountsForTrailblaizeChapter } from './syncCrowdedAccounts';

const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = 50;

export type SyncCrowdedTransactionsResult =
  | {
      ok: true;
      upserted: number;
      accountsScanned: number;
      errors: string[];
    }
  | { ok: false; reason: string };

export type SyncCrowdedTransactionsOptions = {
  /** Only sync this Crowded account id (opaque string). */
  crowdedAccountId?: string;
  maxPagesPerAccount?: number;
  pageLimit?: number;
};

/**
 * TRA-418: Pull transactions per chapter account from Crowded and upsert `crowded_transactions`.
 * Requires `GET …/chapters/:chapterId/accounts/:accountId/transactions` on the Crowded host.
 */
export async function syncCrowdedTransactionsForTrailblaizeChapter(
  supabase: SupabaseClient,
  crowded: CrowdedClient,
  trailblaizeChapterId: string,
  crowdedChapterId: string,
  options?: SyncCrowdedTransactionsOptions
): Promise<SyncCrowdedTransactionsResult> {
  const accountSync = await syncCrowdedAccountsForTrailblaizeChapter(
    supabase,
    crowded,
    trailblaizeChapterId
  );

  if (!accountSync.ok) {
    if (accountSync.reason === 'no_mapping') {
      return { ok: false, reason: 'no chapter mapping for crowded accounts' };
    }
    if (accountSync.reason === 'no_customer') {
      return { ok: false, reason: 'NO_CUSTOMER from Crowded accounts list' };
    }
    if (accountSync.reason === 'db_error') {
      return { ok: false, reason: `crowded_accounts sync: ${accountSync.message}` };
    }
    return { ok: false, reason: 'could not sync crowded_accounts before transactions' };
  }

  let accounts = accountSync.accounts;
  if (options?.crowdedAccountId?.trim()) {
    const want = options.crowdedAccountId.trim();
    accounts = accounts.filter((a) => resolveCrowdedAccountApiId(a) === want);
  }

  const maxPages = options?.maxPagesPerAccount ?? DEFAULT_MAX_PAGES;
  const limit = options?.pageLimit ?? DEFAULT_PAGE_LIMIT;
  const syncedAt = new Date().toISOString();
  let upserted = 0;
  const errors: string[] = [];

  for (const acc of accounts) {
    const accountId = resolveCrowdedAccountApiId(acc);
    if (!accountId) continue;

    let offset = 0;
    for (let page = 0; page < maxPages; page++) {
      let list: { data: Record<string, unknown>[] };
      try {
        list = await crowded.listAccountTransactions(crowdedChapterId, accountId, {
          limit,
          offset,
        });
      } catch (e) {
        if (e instanceof CrowdedApiError && e.statusCode === 404) {
          errors.push(
            `GET …/accounts/${accountId}/transactions returned 404 (route may be unavailable on this host)`
          );
          break;
        }
        const msg = e instanceof CrowdedApiError ? e.message : String(e);
        errors.push(`account ${accountId}: ${msg}`);
        break;
      }

      if (!list.data.length) {
        break;
      }

      const rows: ReturnType<typeof mapCrowdedApiTransactionToUpsertRow>[] = [];
      for (const item of list.data) {
        const norm = normalizeCrowdedTransactionListElement(item);
        const row = mapCrowdedApiTransactionToUpsertRow(
          trailblaizeChapterId,
          accountId,
          norm,
          syncedAt
        );
        if (row) rows.push(row);
      }

      if (rows.length > 0) {
        const { error } = await supabase.from('crowded_transactions').upsert(rows, {
          onConflict: 'chapter_id,crowded_account_id,crowded_transaction_id',
        });
        if (error) {
          errors.push(`upsert failed for account ${accountId}: ${error.message}`);
          break;
        }
        upserted += rows.length;
      }

      if (list.data.length < limit) {
        break;
      }
      offset += limit;
    }
  }

  return {
    ok: true,
    upserted,
    accountsScanned: accounts.length,
    errors,
  };
}
