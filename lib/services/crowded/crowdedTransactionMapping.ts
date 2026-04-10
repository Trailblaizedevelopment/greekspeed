import { createHash } from 'crypto';
import type { CrowdedAccount } from '@/types/crowded';
import { resolveCrowdedAccountApiId } from './crowdedAccountMapping';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Unwrap nested `{ data: { data: T[], meta } }` variants (same pattern as accounts list).
 */
export function unwrapCrowdedTransactionsListPayload(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw;
  }
  const o = raw as Record<string, unknown>;
  const outer = o.data;
  if (outer === null || typeof outer !== 'object' || Array.isArray(outer)) {
    return raw;
  }
  const inner = outer as Record<string, unknown>;
  if (Array.isArray(inner.data)) {
    return {
      data: inner.data,
      meta: inner.meta ?? o.meta,
    };
  }
  return raw;
}

export function normalizeCrowdedTransactionListElement(item: unknown): Record<string, unknown> {
  if (!isRecord(item)) {
    return {};
  }
  let merged: Record<string, unknown> = {};
  const attrs = item.attributes;
  if (isRecord(attrs)) {
    merged = { ...merged, ...attrs };
  }
  merged = { ...merged, ...item };
  return merged;
}

const TX_ID_KEYS = [
  'id',
  'transactionId',
  'transaction_id',
  'uuid',
  'externalId',
  'external_id',
] as const;

export function pickCrowdedTransactionIdFromRecord(obj: Record<string, unknown>): string | null {
  for (const k of TX_ID_KEYS) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

export function pickAmountMinorFromTransactionRecord(obj: Record<string, unknown>): number | null {
  const keys = ['amountMinor', 'amount_minor', 'amountCents', 'amount_cents', 'amount'] as const;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      return Math.round(v);
    }
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return Math.round(n);
    }
  }
  return null;
}

function pickOptionalIso(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

export type CrowdedTransactionUpsertRow = {
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
};

/**
 * Map a normalized API transaction object to a `crowded_transactions` upsert row.
 */
export function mapCrowdedApiTransactionToUpsertRow(
  trailblaizeChapterId: string,
  crowdedAccountId: string,
  normalized: Record<string, unknown>,
  syncedAtIso: string
): CrowdedTransactionUpsertRow | null {
  const crowded_transaction_id = pickCrowdedTransactionIdFromRecord(normalized);
  if (!crowded_transaction_id) {
    return null;
  }
  const amount_minor = pickAmountMinorFromTransactionRecord(normalized);
  const currency =
    typeof normalized.currency === 'string' && normalized.currency.trim()
      ? normalized.currency.trim()
      : 'USD';
  let desc: string | null = null;
  for (const k of ['description', 'memo', 'narrative'] as const) {
    const v = normalized[k];
    if (typeof v === 'string' && v.trim()) {
      desc = v.trim();
      break;
    }
  }
  if (!desc && typeof normalized.type === 'string' && normalized.type.trim()) {
    desc = normalized.type.trim();
  }
  const status =
    typeof normalized.status === 'string' && normalized.status.trim()
      ? normalized.status.trim()
      : null;
  const occurred_at =
    pickOptionalIso(normalized, ['occurredAt', 'occurred_at', 'createdAt', 'created_at']) ?? null;
  const posted_at = pickOptionalIso(normalized, ['postedAt', 'posted_at']) ?? null;

  return {
    chapter_id: trailblaizeChapterId,
    crowded_account_id: crowdedAccountId,
    crowded_transaction_id,
    amount_minor,
    currency,
    description: desc,
    status,
    occurred_at,
    posted_at,
    synced_at: syncedAtIso,
  };
}

const WEBHOOK_ACCOUNT_KEYS = new Set([
  'accountId',
  'account_id',
  'ledgerAccountId',
  'ledger_account_id',
  'bankingAccountId',
  'banking_account_id',
]);

export function extractCrowdedAccountIdFromPayload(obj: unknown): string | null {
  if (!isRecord(obj)) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (WEBHOOK_ACCOUNT_KEYS.has(k) && typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const v of Object.values(obj)) {
    if (v !== null && typeof v === 'object') {
      const found = extractCrowdedAccountIdFromPayload(v);
      if (found) return found;
    }
  }
  return null;
}

const WEBHOOK_PAYMENT_TX_KEYS = new Set([
  'paymentId',
  'payment_id',
  'transactionId',
  'transaction_id',
  'stripePaymentIntentId',
  'stripe_payment_intent_id',
]);

/**
 * Stable id when Crowded does not send an explicit payment/transaction id (idempotent per collection+contact+amount+status).
 */
export function buildSyntheticCollectTransactionId(
  collectionId: string,
  contactId: string,
  amountMinor: number | null,
  status: string
): string {
  const basis = `${collectionId}:${contactId}:${amountMinor ?? ''}:${status}`;
  const h = createHash('sha256').update(basis, 'utf8').digest('hex').slice(0, 32);
  return `collect:${h}`;
}

export function extractCrowdedPaymentTransactionIdFromPayload(obj: unknown): string | null {
  if (!isRecord(obj)) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (WEBHOOK_PAYMENT_TX_KEYS.has(k) && typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const v of Object.values(obj)) {
    if (v !== null && typeof v === 'object') {
      const found = extractCrowdedPaymentTransactionIdFromPayload(v);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Choose a chapter account for a Collect webhook: explicit id in payload, else contact’s wallet, else first chapter-level, else first list item.
 */
export function resolveCrowdedAccountIdForCollectEvent(
  accounts: CrowdedAccount[],
  contactId: string,
  payloadAccountId: string | null
): string | null {
  if (payloadAccountId?.trim()) {
    return payloadAccountId.trim();
  }
  for (const a of accounts) {
    const id = resolveCrowdedAccountApiId(a);
    if (!id) continue;
    const c = a.contactId ?? a.contact_id;
    if (c && c === contactId) return id;
  }
  for (const a of accounts) {
    const id = resolveCrowdedAccountApiId(a);
    if (!id) continue;
    const c = a.contactId ?? a.contact_id;
    if (c == null || String(c).trim() === '') return id;
  }
  const first = accounts[0];
  return first ? resolveCrowdedAccountApiId(first) ?? null : null;
}
