import type { CrowdedAccount } from '@/types/crowded';

/** Known Crowded / wrapper keys that carry the account UUID (flat object after {@link normalizeCrowdedAccountListElement}). */
const CROWDED_ACCOUNT_API_ID_KEYS: readonly string[] = [
  'id',
  'accountId',
  'account_id',
  'uuid',
  'accountUuid',
  'accountUUID',
  'account_uuid',
  'ledgerAccountId',
  'ledger_account_id',
  'bankingAccountId',
  'banking_account_id',
];

function readNonEmptyTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Read account UUID from a **flat** record (after merging `attributes` / nested `account`).
 */
export function pickCrowdedAccountIdFromUnknownRecord(
  obj: Record<string, unknown>
): string | undefined {
  for (const k of CROWDED_ACCOUNT_API_ID_KEYS) {
    const s = readNonEmptyTrimmedString(obj[k]);
    if (s) return s;
  }
  return undefined;
}

/**
 * Merge JSON:API-style `attributes`, nested `account`, then top-level fields so list items match {@link CrowdedAccount}.
 * Call from {@link CrowdedClient.listAccounts} / single-account normalization before mapping or Zod.
 */
export function normalizeCrowdedAccountListElement(item: unknown): CrowdedAccount {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Crowded account payload must be a non-null object');
  }
  const o = item as Record<string, unknown>;

  let merged: Record<string, unknown> = {};

  const attrs = o.attributes;
  if (attrs !== null && typeof attrs === 'object' && !Array.isArray(attrs)) {
    merged = { ...merged, ...(attrs as Record<string, unknown>) };
  }

  const acc = o.account;
  if (acc !== null && typeof acc === 'object' && !Array.isArray(acc)) {
    merged = { ...merged, ...(acc as Record<string, unknown>) };
  }

  merged = { ...merged, ...o };

  const crowdedId = pickCrowdedAccountIdFromUnknownRecord(merged);
  if (crowdedId != null && merged.id == null) {
    merged = { ...merged, id: crowdedId };
  }

  return merged as unknown as CrowdedAccount;
}

/**
 * Crowded list payloads may use `accountId`, snake_case, JSON:API `attributes`, or a nested `account` object.
 */
export function resolveCrowdedAccountApiId(account: CrowdedAccount): string | undefined {
  const flat = account as unknown as Record<string, unknown>;
  return pickCrowdedAccountIdFromUnknownRecord(flat);
}

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
  const crowdedAccountId = resolveCrowdedAccountApiId(account);
  if (!crowdedAccountId) {
    throw new Error(
      'Crowded account payload missing a resolvable account id (tried id, accountId, account_id, uuid, nested account / attributes) — cannot upsert crowded_accounts'
    );
  }
  return {
    chapter_id: trailblaizeChapterId,
    crowded_account_id: crowdedAccountId,
    display_name: account.name ?? null,
    status: account.status ?? null,
    currency: account.currency ?? null,
    crowded_contact_id: account.contactId ?? account.contact_id ?? null,
    balance_minor: account.balance ?? null,
    hold_minor: account.hold ?? null,
    available_minor: account.available ?? null,
  };
}
