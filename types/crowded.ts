/**
 * Crowded API (sandbox) response shapes — aligned with Postman verification.
 * @see docs/development/features/crowded_cursor_postman_session.md
 */

/** Pagination object under `meta` for list endpoints */
export interface CrowdedPaginationMeta {
  total: number;
  limit: number;
  offset: number;
  sort: string;
  order: string;
}

export interface CrowdedListMeta {
  pagination: CrowdedPaginationMeta;
}

/** Standard list wrapper: `{ data: T[], meta: { pagination } }` */
export interface CrowdedListResponse<T> {
  data: T[];
  meta: CrowdedListMeta;
}

/** Single-resource wrapper used by GET contact by id: `{ data: T }` */
export interface CrowdedSingleResponse<T> {
  data: T;
}

export interface CrowdedOrganization {
  id: string;
  name: string;
  createdAt: string;
}

export type CrowdedChapterStatus = string;
export type CrowdedBusinessVertical = string;

export interface CrowdedChapter {
  id: string;
  name: string | null;
  organization: string;
  organizationId: string;
  status: CrowdedChapterStatus;
  businessVertical: CrowdedBusinessVertical;
  createdAt: string;
}

export type CrowdedContactStatus = string;

export interface CrowdedContact {
  id: string;
  chapterId: string;
  firstName: string;
  lastName: string;
  mobile?: string;
  email?: string;
  dateOfBirth?: string;
  status: CrowdedContactStatus;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string | null;
}

/** Chapter-scoped banking account (GET …/chapters/:chapterId/accounts). @see docs/development/features/crowded_cursor_postman_session.md */
export interface CrowdedAccount {
  /**
   * Crowded’s canonical account id (opaque string: often numeric, e.g. `"12832675"`, or a UUID in some envs).
   * May also appear as **`accountId`**, snake_case, **`uuid`**, JSON:API **`attributes`**, or nested **`account`**;
   * {@link normalizeCrowdedAccountListElement} / {@link mapCrowdedAccountToSyncFields} resolve it.
   */
  id?: string;
  accountId?: string;
  /** Some list payloads use `uuid` instead of `id`. */
  uuid?: string;
  name: string;
  status: string;
  /** Masked or last-four style; treat as sensitive in logs/UI */
  accountNumber?: string;
  routingNumber?: string;
  currency: string;
  /** Amounts as returned by Crowded (typically minor units); map to `crowded_accounts.*_minor` */
  balance?: number;
  hold?: number;
  available?: number;
  contactId?: string;
  contact_id?: string;
  /** e.g. `checking` when returned by the API */
  product?: string;
  createdAt: string;
}

/** Crowded error JSON body (non-2xx). `details` shape varies by endpoint (string, string[], object). */
export interface CrowdedErrorBody {
  type?: string;
  statusCode?: number;
  message?: string;
  details?: unknown;
  requestId?: string;
}

/** Bulk create accounts — `product` must be `wallet` or `perdiem` (not `checking`). */
export type CrowdedBulkCreateAccountItemProduct = 'wallet' | 'perdiem';

export interface CrowdedBulkCreateAccountItem {
  contactId: string;
  product: CrowdedBulkCreateAccountItemProduct;
}

/** Wire body for POST /api/v1/chapters/:chapterId/accounts */
export interface CrowdedBulkCreateAccountsRequestBody {
  items: CrowdedBulkCreateAccountItem[];
  idempotencyKey: string;
}

export interface CrowdedBulkCreateAccountsRequest {
  data: CrowdedBulkCreateAccountsRequestBody;
}

/** One row in the bulk-create results array (sandbox / Postman). */
export interface CrowdedBulkCreateAccountResult {
  contactId: string;
  accountId: string;
  product: string;
  error: boolean;
  message: string;
  accountCreated: boolean;
  cardCreated: boolean;
}

export interface CrowdedBulkCreateAccountsResponseData {
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  results: CrowdedBulkCreateAccountResult[];
}

export interface CrowdedBulkCreateAccountsResponse {
  data: CrowdedBulkCreateAccountsResponseData;
}

/** Dues / collect “collection” under a chapter (POST …/collections, GET …/collections/:id). @see docs/development/features/crowded_cursor_postman_session.md */
export interface CrowdedCollection {
  id: string;
  title: string;
  requestedAmount: number;
  goalAmount?: number | null;
  createdAt: string;
}

/** Wire body for POST /api/v1/chapters/:chapterId/collections */
export interface CrowdedCreateCollectionRequest {
  data: {
    title: string;
    /** Minor units (cents). */
    requestedAmount: number;
  };
}

/**
 * Wire body for POST …/chapters/:chapterId/collections/:collectionId/intents.
 * All fields live under `data` (not root-level siblings).
 */
export interface CrowdedCreateCollectIntentRequest {
  data: {
    contactId: string;
    /** Minor units (cents) — usually matches collection `requestedAmount`. */
    requestedAmount: number;
    payerIp: string;
    userConsented: boolean;
    /** Optional return URLs after Crowded checkout (if supported by API). */
    successUrl?: string;
    failureUrl?: string;
  };
}

/** Intent row returned by Create Intent (200). Member pays via `paymentUrl`. */
export interface CrowdedCollectIntent {
  id: string;
  contactId: string;
  requestedAmount: number;
  paidAmount: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  status: string;
  payments: unknown[];
  createdAt: string;
  successUrl?: string | null;
  failureUrl?: string | null;
  paymentUrl: string;
}

/**
 * Ledger / transaction row from Crowded (GET …/accounts/:accountId/transactions).
 * Shape varies by environment — normalized in {@link normalizeCrowdedTransactionListElement}.
 */
export interface CrowdedApiTransaction {
  id?: string;
  transactionId?: string;
  transaction_id?: string;
  uuid?: string;
  amount?: number;
  amountMinor?: number;
  amount_minor?: number;
  currency?: string;
  description?: string;
  memo?: string;
  status?: string;
  type?: string;
  createdAt?: string;
  occurredAt?: string;
  occurred_at?: string;
  postedAt?: string;
  posted_at?: string;
}
