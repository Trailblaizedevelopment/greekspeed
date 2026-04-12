import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrowdedAccount } from '@/types/crowded';
import type { CrowdedChapterBalanceAccountRow } from '@/types/crowdedBalance';
import {
  CrowdedApiError,
  type CrowdedClient,
  isCrowdedNoCustomerError,
} from './crowded-client';
import { mapCrowdedAccountToSyncFields, resolveCrowdedAccountApiId } from './crowdedAccountMapping';
import { upsertCrowdedAccountsFromList } from './syncCrowdedAccounts';

/** USD from Crowded minor units (cents). */
export function crowdedMinorToUsd(minor: number): number {
  return minor / 100;
}

function safeMinorBalance(account: CrowdedAccount): number {
  const n = Number(account.balance);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export type CrowdedChapterBalanceSuccess = {
  ok: true;
  balanceUsd: number;
  totalBalanceMinor: number;
  syncedAt: string;
  accountCount: number;
  accounts: CrowdedChapterBalanceAccountRow[];
  dbSyncError: string | null;
};

export type CrowdedChapterBalanceFailure =
  | { ok: false; code: 'no_customer'; message: string }
  | { ok: false; code: 'api_error'; message: string; statusCode?: number };

export type CrowdedChapterBalanceResult = CrowdedChapterBalanceSuccess | CrowdedChapterBalanceFailure;

/**
 * Lists Crowded chapter accounts, aggregates balance (minor units → USD), and best-effort upserts `crowded_accounts`.
 */
export async function getCrowdedChapterBalanceForChapter(
  supabase: SupabaseClient,
  crowdedClient: CrowdedClient,
  trailblaizeChapterId: string,
  crowdedChapterId: string
): Promise<CrowdedChapterBalanceResult> {
  let list: { data: CrowdedAccount[] };
  try {
    list = await crowdedClient.listAccounts(crowdedChapterId);
  } catch (e) {
    if (e instanceof CrowdedApiError && isCrowdedNoCustomerError(e)) {
      return {
        ok: false,
        code: 'no_customer',
        message:
          'Crowded banking is not set up for this chapter yet. Finish onboarding in the Crowded portal, then balances will appear here.',
      };
    }
    if (e instanceof CrowdedApiError) {
      return {
        ok: false,
        code: 'api_error',
        message: e.message || 'Could not load Crowded account balances.',
        statusCode: e.statusCode,
      };
    }
    return {
      ok: false,
      code: 'api_error',
      message: e instanceof Error ? e.message : 'Could not load Crowded account balances.',
    };
  }

  const accounts = Array.isArray(list.data) ? list.data : [];
  const syncedAt = new Date().toISOString();

  const upsertPayload: CrowdedAccount[] = [];
  for (const acc of accounts) {
    try {
      mapCrowdedAccountToSyncFields(trailblaizeChapterId, acc);
      upsertPayload.push(acc);
    } catch {
      /* omit rows we cannot map for DB sync */
    }
  }

  let dbSyncError: string | null = null;
  if (upsertPayload.length > 0) {
    const persist = await upsertCrowdedAccountsFromList(
      supabase,
      trailblaizeChapterId,
      upsertPayload
    );
    if (!persist.ok) {
      dbSyncError = persist.message;
    }
  }

  const totalBalanceMinor = accounts.reduce((sum, acc) => sum + safeMinorBalance(acc), 0);

  const rows: CrowdedChapterBalanceAccountRow[] = accounts.map((acc) => {
    const crowdedAccountId = resolveCrowdedAccountApiId(acc) ?? 'unknown';
    const minor = safeMinorBalance(acc);
    const name =
      typeof acc.name === 'string' && acc.name.trim().length > 0 ? acc.name.trim() : 'Account';
    return {
      crowdedAccountId,
      displayName: name,
      balanceUsd: crowdedMinorToUsd(minor),
      currency: acc.currency ?? null,
      product: typeof acc.product === 'string' ? acc.product : null,
      status: typeof acc.status === 'string' ? acc.status : null,
      contactId:
        typeof acc.contactId === 'string'
          ? acc.contactId
          : typeof acc.contact_id === 'string'
            ? acc.contact_id
            : null,
    };
  }).sort((a, b) => {
    const rank = (product: string | null) => {
      switch ((product ?? '').toLowerCase()) {
        case 'checking':
          return 0;
        case 'wallet':
          return 1;
        case 'perdiem':
          return 2;
        default:
          return 3;
      }
    };
    return rank(a.product) - rank(b.product);
  });

  return {
    ok: true,
    balanceUsd: crowdedMinorToUsd(totalBalanceMinor),
    totalBalanceMinor,
    syncedAt,
    accountCount: accounts.length,
    accounts: rows,
    dbSyncError,
  };
}
