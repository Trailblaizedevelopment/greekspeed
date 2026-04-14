/**
 * Crowded API client — server-side only (uses secret token from env).
 * @see docs/development/features/crowded_cursor_postman_session.md
 */
import type {
  CrowdedAccount,
  CrowdedBulkCreateAccountsRequest,
  CrowdedBulkCreateAccountsResponse,
  CrowdedBulkCreateContactsRequest,
  CrowdedBulkCreateContactsResponse,
  CrowdedChapter,
  CrowdedCollectIntent,
  CrowdedCollectIntentSummary,
  CrowdedCollection,
  CrowdedContact,
  CrowdedCreateCollectIntentRequest,
  CrowdedCreateCollectionRequest,
  CrowdedErrorBody,
  CrowdedListMeta,
  CrowdedListResponse,
  CrowdedOrganization,
  CrowdedPatchContactRequest,
  CrowdedSingleResponse,
} from '@/types/crowded';
import {
  crowdedAccountListResponseSchema,
  crowdedAccountSingleResponseSchema,
  crowdedBulkCreateAccountsResponseSchema,
  crowdedBulkCreateContactsResponseSchema,
  crowdedChapterListResponseSchema,
  crowdedCollectIntentSingleResponseSchema,
  crowdedCollectionSingleResponseSchema,
  crowdedTransactionListResponseSchema,
  crowdedContactListResponseSchema,
  crowdedContactSingleResponseSchema,
  crowdedOrganizationListResponseSchema,
} from './crowded-schemas';
import { normalizeCrowdedAccountListElement } from './crowdedAccountMapping';
import {
  normalizeCrowdedTransactionListElement,
  unwrapCrowdedTransactionsListPayload,
} from './crowdedTransactionMapping';
import { normalizeCrowdedCollectIntentSummary } from './crowdedIntentSummary';

const API_PREFIX = '/api/v1';

/**
 * Normalize Crowded `details` for {@link CrowdedApiError}: API may send a string, string[], or other shapes.
 */
export function normalizeCrowdedErrorDetails(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t.length > 0 ? [t] : undefined;
  }
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        const s = item.trim();
        if (s.length > 0) out.push(s);
      } else if (typeof item === 'number' && Number.isFinite(item)) {
        out.push(String(item));
      }
    }
    return out.length > 0 ? out : undefined;
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const key of ['code', 'detail', 'message', 'reason'] as const) {
      const v = o[key];
      if (typeof v === 'string' && v.trim().length > 0) {
        return [v.trim()];
      }
    }
  }
  return undefined;
}

export class CrowdedApiError extends Error {
  readonly statusCode: number;
  readonly type?: string;
  /** Normalized detail strings (see {@link normalizeCrowdedErrorDetails}). */
  readonly details?: string[];
  readonly requestId?: string;
  readonly body?: CrowdedErrorBody;

  constructor(
    message: string,
    options: {
      statusCode: number;
      type?: string;
      details?: unknown;
      requestId?: string;
      body?: CrowdedErrorBody;
    }
  ) {
    super(message);
    this.name = 'CrowdedApiError';
    this.statusCode = options.statusCode;
    this.type = options.type;
    this.details = normalizeCrowdedErrorDetails(options.details);
    this.requestId = options.requestId;
    this.body = options.body;
  }

  /** Known Crowded business codes in `details`, e.g. NO_CUSTOMER */
  hasDetail(code: string): boolean {
    const d = this.details;
    if (!Array.isArray(d)) {
      return false;
    }
    return d.includes(code);
  }
}

/** `details` code when no banking customer exists for the chapter/org yet (finish portal setup). */
export const CROWDED_ERROR_DETAIL_NO_CUSTOMER = 'NO_CUSTOMER' as const;

export function isCrowdedNoCustomerError(error: unknown): error is CrowdedApiError {
  return (
    error instanceof CrowdedApiError && error.hasDetail(CROWDED_ERROR_DETAIL_NO_CUSTOMER)
  );
}

export interface CrowdedClientConfig {
  baseUrl: string;
  token: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Build full URL: base + /api/v1 + path.
 * Pass short paths like `/organizations` or `organizations`.
 */
export function buildCrowdedUrl(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  let p = path.startsWith('/') ? path : `/${path}`;
  if (!p.startsWith(API_PREFIX)) {
    p = `${API_PREFIX}${p}`;
  }
  return `${base}${p}`;
}

function shouldValidateResponses(): boolean {
  const v = process.env.CROWDED_VALIDATE_RESPONSES;
  return v === '1' || v === 'true';
}

/** When `CROWDED_DEBUG_SYNC=1|true|yes`, logs bulk contact create shape and sync verification (local/staging only; may include PII). */
export function isCrowdedDebugSyncEnabled(): boolean {
  const v = process.env.CROWDED_DEBUG_SYNC?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** When `CROWDED_DEBUG_CHECKOUT_LINK=1|true|yes`, logs failed Crowded HTTP calls (path + status; dev only). */
export function isCrowdedDebugCheckoutLinkEnabled(): boolean {
  const v = process.env.CROWDED_DEBUG_CHECKOUT_LINK?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function maybeParse<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  if (!shouldValidateResponses()) {
    return data as T;
  }
  return schema.parse(data);
}

function appendSearchParams(
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    params.set(k, String(v));
  }
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

/**
 * Crowded accounts list sometimes nests the real payload: `{ data: { data: T[], meta } }`
 * instead of `{ data: T[], meta }`. Unwrap so downstream normalization sees a list of accounts.
 */
export function unwrapCrowdedAccountsListPayload(raw: unknown): unknown {
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

/** Single-account GET may use the same extra `data` wrapper as list. */
function unwrapCrowdedAccountSinglePayload(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw;
  }
  const o = raw as Record<string, unknown>;
  const outer = o.data;
  if (outer === null || typeof outer !== 'object' || Array.isArray(outer)) {
    return raw;
  }
  const inner = outer as Record<string, unknown>;
  const innerData = inner.data;
  if (
    innerData !== null &&
    typeof innerData === 'object' &&
    !Array.isArray(innerData)
  ) {
    return { ...o, data: innerData };
  }
  return raw;
}

/**
 * Crowded may return `data` as a single object for GET …/accounts when one account exists.
 * Our contract and Zod list schema expect `data: T[]`.
 */
function normalizeCrowdedListBody(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw;
  }
  const o = raw as Record<string, unknown>;
  const d = o.data;
  if (Array.isArray(d)) {
    return raw;
  }
  if (d !== null && typeof d === 'object') {
    return { ...o, data: [d] };
  }
  return { ...o, data: [] };
}

/** Single-account GET: same shape variants as list (`accountId`, JSON:API `attributes`, nested `account`). */
function normalizeCrowdedAccountSingleBody(raw: unknown): unknown {
  const unwrapped = unwrapCrowdedAccountSinglePayload(raw);
  if (unwrapped === null || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) {
    return unwrapped;
  }
  const o = unwrapped as Record<string, unknown>;
  const d = o.data;
  if (d === null || typeof d !== 'object' || Array.isArray(d)) {
    return unwrapped;
  }
  return { ...o, data: normalizeCrowdedAccountListElement(d) };
}

export class CrowdedClient {
  constructor(private readonly config: CrowdedClientConfig) {}

  /**
   * Low-level JSON request. Path is relative to `/api/v1`.
   * On non-OK, throws {@link CrowdedApiError} with parsed JSON body when available.
   */
  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const url = buildCrowdedUrl(this.config.baseUrl, path);
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.config.token}`,
        ...init.headers,
      },
    });

    const text = await res.text();
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = undefined;
      }
    }

    if (!res.ok) {
      if (isCrowdedDebugCheckoutLinkEnabled()) {
        const method = (init.method ?? 'GET').toUpperCase();
        console.error('[CROWDED_DEBUG_CHECKOUT_LINK] Crowded HTTP error', {
          method,
          path,
          httpStatus: res.status,
          responsePreview: text.slice(0, 400),
        });
      }
      const body = json && typeof json === 'object' ? (json as CrowdedErrorBody) : undefined;
      const message =
        body?.message ??
        (text.slice(0, 200) || `Crowded API error: ${res.status} ${res.statusText}`);
      throw new CrowdedApiError(message, {
        statusCode: body?.statusCode ?? res.status,
        type: body?.type,
        details: body?.details,
        requestId: body?.requestId,
        body,
      });
    }

    return json as T;
  }

  /**
   * Low-level GET. Path is relative to `/api/v1` (e.g. `/organizations` or `chapters`).
   * On non-OK, throws {@link CrowdedApiError} with parsed JSON body when available.
   */
  async getJson<T>(path: string, init?: RequestInit): Promise<T> {
    return this.requestJson<T>(path, { ...init, method: 'GET' });
  }

  /**
   * Low-level POST with JSON body. On non-OK, throws {@link CrowdedApiError} (same as {@link getJson}).
   */
  async postJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
    return this.requestJson<T>(path, {
      ...init,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /**
   * Low-level PATCH with JSON body. On non-OK, throws {@link CrowdedApiError} (same as {@link getJson}).
   */
  async patchJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
    return this.requestJson<T>(path, {
      ...init,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** GET /api/v1/organizations */
  async listOrganizations(): Promise<CrowdedListResponse<CrowdedOrganization>> {
    const raw = await this.getJson<unknown>('/organizations');
    return maybeParse(crowdedOrganizationListResponseSchema, raw) as CrowdedListResponse<CrowdedOrganization>;
  }

  /** GET /api/v1/chapters */
  async listChapters(): Promise<CrowdedListResponse<CrowdedChapter>> {
    const raw = await this.getJson<unknown>('/chapters');
    return maybeParse(crowdedChapterListResponseSchema, raw) as CrowdedListResponse<CrowdedChapter>;
  }

  /** GET /api/v1/chapters/:chapterId/contacts */
  async listContacts(
    chapterId: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<CrowdedListResponse<CrowdedContact>> {
    const path = appendSearchParams(
      `/chapters/${encodeURIComponent(chapterId)}/contacts`,
      query
    );
    const raw = await this.getJson<unknown>(path);
    return maybeParse(crowdedContactListResponseSchema, raw) as CrowdedListResponse<CrowdedContact>;
  }

  /**
   * POST /api/v1/chapters/:chapterId/contacts — bulk create chapter contacts.
   * @see Crowded API Docs (Postman) — Bulk Create Contacts
   */
  async bulkCreateContacts(
    chapterId: string,
    body: CrowdedBulkCreateContactsRequest
  ): Promise<CrowdedBulkCreateContactsResponse> {
    const raw = await this.postJson<unknown>(
      `/chapters/${encodeURIComponent(chapterId)}/contacts`,
      body
    );
    const parsed = maybeParse(crowdedBulkCreateContactsResponseSchema, raw) as {
      data?: CrowdedContact | CrowdedContact[];
    };
    const d = parsed.data;
    const list = Array.isArray(d) ? d : d ? [d] : [];

    if (isCrowdedDebugSyncEnabled()) {
      const top = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
      const dataField = top?.data;
      const preview =
        typeof raw === 'string' ? raw.slice(0, 2500) : JSON.stringify(raw, null, 0).slice(0, 2500);
      console.info('[CROWDED_DEBUG_SYNC] bulkCreateContacts response shape', {
        crowdedChapterId: `${chapterId.slice(0, 8)}…`,
        requestEmails: body.data.map((row) => row.email),
        topLevelKeys: top ? Object.keys(top) : typeof raw,
        dataFieldIsArray: Array.isArray(dataField),
        dataFieldType: dataField === null || dataField === undefined ? String(dataField) : typeof dataField,
        normalizedListLength: list.length,
        normalizedListSummaries: list.map((row) => {
          const o = row as unknown as Record<string, unknown>;
          return {
            keys: Object.keys(o),
            id: typeof o.id === 'string' ? `${o.id.slice(0, 8)}…` : o.id,
            email: o.email,
          };
        }),
        rawJsonPreview: preview,
      });
    }

    return { data: list };
  }

  /** GET /api/v1/chapters/:chapterId/contacts/:contactId */
  async getContact(chapterId: string, contactId: string): Promise<CrowdedSingleResponse<CrowdedContact>> {
    const raw = await this.getJson<unknown>(
      `/chapters/${encodeURIComponent(chapterId)}/contacts/${encodeURIComponent(contactId)}`
    );
    return maybeParse(crowdedContactSingleResponseSchema, raw) as CrowdedSingleResponse<CrowdedContact>;
  }

  /** PATCH /api/v1/chapters/:chapterId/contacts/:contactId */
  async patchContact(
    chapterId: string,
    contactId: string,
    body: CrowdedPatchContactRequest
  ): Promise<CrowdedSingleResponse<CrowdedContact>> {
    const raw = await this.patchJson<unknown>(
      `/chapters/${encodeURIComponent(chapterId)}/contacts/${encodeURIComponent(contactId)}`,
      body
    );
    return maybeParse(crowdedContactSingleResponseSchema, raw) as CrowdedSingleResponse<CrowdedContact>;
  }

  /**
   * GET /api/v1/chapters/:chapterId/accounts
   * List chapter accounts. Sandbox may return **400** with `details: ["NO_CUSTOMER"]` until banking setup is complete — use {@link isCrowdedNoCustomerError}.
   */
  async listAccounts(
    chapterId: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<CrowdedListResponse<CrowdedAccount>> {
    const path = appendSearchParams(
      `/chapters/${encodeURIComponent(chapterId)}/accounts`,
      query
    );
    const raw = await this.getJson<unknown>(path);
    const normalized = normalizeCrowdedListBody(unwrapCrowdedAccountsListPayload(raw));
    const body = normalized as { data?: unknown[]; meta?: unknown };
    const data = Array.isArray(body.data)
      ? body.data.map((item) => normalizeCrowdedAccountListElement(item))
      : [];
    return maybeParse(crowdedAccountListResponseSchema, {
      ...body,
      data,
    }) as CrowdedListResponse<CrowdedAccount>;
  }

  /** GET /api/v1/chapters/:chapterId/accounts/:accountId */
  async getAccount(chapterId: string, accountId: string): Promise<CrowdedSingleResponse<CrowdedAccount>> {
    const raw = await this.getJson<unknown>(
      `/chapters/${encodeURIComponent(chapterId)}/accounts/${encodeURIComponent(accountId)}`
    );
    const normalized = normalizeCrowdedAccountSingleBody(raw);
    return maybeParse(
      crowdedAccountSingleResponseSchema,
      normalized
    ) as CrowdedSingleResponse<CrowdedAccount>;
  }

  /**
   * GET /api/v1/chapters/:chapterId/accounts/:accountId/transactions
   * Pull ledger rows for TRA-418. Returns **404** if the route is not registered for this API build — callers should catch.
   */
  async listAccountTransactions(
    chapterId: string,
    accountId: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<CrowdedListResponse<Record<string, unknown>>> {
    const path = appendSearchParams(
      `/chapters/${encodeURIComponent(chapterId)}/accounts/${encodeURIComponent(accountId)}/transactions`,
      query
    );
    const raw = await this.getJson<unknown>(path);
    const normalized = normalizeCrowdedListBody(unwrapCrowdedTransactionsListPayload(raw));
    const body = normalized as { data?: unknown[]; meta?: unknown };
    const data = Array.isArray(body.data)
      ? body.data.map((item) => normalizeCrowdedTransactionListElement(item))
      : [];
    const parsed = maybeParse(crowdedTransactionListResponseSchema, {
      ...body,
      data,
    }) as { data: Record<string, unknown>[]; meta?: CrowdedListMeta };
    const meta: CrowdedListMeta = parsed.meta ?? {
      pagination: {
        total: parsed.data.length,
        limit: parsed.data.length,
        offset: 0,
        sort: 'unknown',
        order: 'desc',
      },
    };
    return { data: parsed.data, meta };
  }

  /**
   * POST /api/v1/chapters/:chapterId/accounts — bulk create wallet / per-diem accounts for contacts.
   * @see docs/development/features/crowded_cursor_postman_session.md
   */
  async bulkCreateAccounts(
    chapterId: string,
    body: CrowdedBulkCreateAccountsRequest
  ): Promise<CrowdedBulkCreateAccountsResponse> {
    const raw = await this.postJson<unknown>(
      `/chapters/${encodeURIComponent(chapterId)}/accounts`,
      body
    );
    return maybeParse(
      crowdedBulkCreateAccountsResponseSchema,
      raw
    ) as CrowdedBulkCreateAccountsResponse;
  }

  /**
   * POST /api/v1/chapters/:chapterId/collections — create a dues / collect campaign.
   * Sandbox typically returns **201 Created**.
   * @see docs/development/features/crowded_cursor_postman_session.md
   */
  async createCollection(
    chapterId: string,
    body: CrowdedCreateCollectionRequest
  ): Promise<CrowdedSingleResponse<CrowdedCollection>> {
    const raw = await this.postJson<unknown>(
      `/chapters/${encodeURIComponent(chapterId)}/collections`,
      body
    );
    return maybeParse(
      crowdedCollectionSingleResponseSchema,
      raw
    ) as CrowdedSingleResponse<CrowdedCollection>;
  }

  /**
   * GET /api/v1/chapters/:chapterId/collections/:collectionId — optional; use when Crowded exposes it.
   */
  async getCollection(
    chapterId: string,
    collectionId: string
  ): Promise<CrowdedSingleResponse<CrowdedCollection>> {
    const raw = await this.getJson<unknown>(
      `/chapters/${encodeURIComponent(chapterId)}/collections/${encodeURIComponent(collectionId)}`
    );
    return maybeParse(
      crowdedCollectionSingleResponseSchema,
      raw
    ) as CrowdedSingleResponse<CrowdedCollection>;
  }

  /**
   * POST /api/v1/chapters/:chapterId/collections/:collectionId/intents — payer intent + **`data.paymentUrl`** checkout link.
   * @see docs/development/features/crowded_cursor_postman_session.md
   */
  async createIntent(
    chapterId: string,
    collectionId: string,
    body: CrowdedCreateCollectIntentRequest
  ): Promise<CrowdedSingleResponse<CrowdedCollectIntent>> {
    const raw = await this.postJson<unknown>(
      `/chapters/${encodeURIComponent(chapterId)}/collections/${encodeURIComponent(collectionId)}/intents`,
      body
    );
    return maybeParse(
      crowdedCollectIntentSingleResponseSchema,
      raw
    ) as CrowdedSingleResponse<CrowdedCollectIntent>;
  }

  /**
   * GET /api/v1/chapters/:chapterId/collections/:collectionId/intents
   * When Crowded does not expose this route, callers should catch {@link CrowdedApiError} **404** and treat as an empty list.
   */
  async listCollectionIntents(
    chapterId: string,
    collectionId: string
  ): Promise<CrowdedListResponse<CrowdedCollectIntentSummary>> {
    const path = `/chapters/${encodeURIComponent(chapterId)}/collections/${encodeURIComponent(collectionId)}/intents`;
    const raw = await this.getJson<unknown>(path);
    const normalized = normalizeCrowdedListBody(raw);
    const body = normalized as { data?: unknown[]; meta?: unknown };
    const rows = Array.isArray(body.data) ? body.data : [];
    const data: CrowdedCollectIntentSummary[] = [];
    for (const row of rows) {
      const n = normalizeCrowdedCollectIntentSummary(row);
      if (n) data.push(n);
    }
    const parsedMeta = body.meta as CrowdedListMeta | undefined;
    const meta: CrowdedListMeta =
      parsedMeta?.pagination != null
        ? parsedMeta
        : {
            pagination: {
              total: data.length,
              limit: data.length,
              offset: 0,
              sort: 'unknown',
              order: 'desc',
            },
          };
    return { data, meta };
  }
}

/** Member checkout URL from {@link CrowdedClient.createIntent}, or `undefined` if missing/empty. */
export function getCrowdedIntentPaymentUrl(
  response: CrowdedSingleResponse<CrowdedCollectIntent>
): string | undefined {
  const u = response.data.paymentUrl;
  return typeof u === 'string' && u.trim().length > 0 ? u.trim() : undefined;
}

/**
 * Read config from process.env. Call only on the server or in scripts.
 * Uses CROWDED_API_TOKEN; falls back to CROWDED_API_KEY for older .env files.
 */
export function getCrowdedClientConfigFromEnv(): CrowdedClientConfig {
  const baseUrl = process.env.CROWDED_API_BASE_URL?.trim();
  const token =
    process.env.CROWDED_API_TOKEN?.trim() || process.env.CROWDED_API_KEY?.trim();

  if (!baseUrl) {
    throw new Error('Missing CROWDED_API_BASE_URL');
  }
  if (!token) {
    throw new Error('Missing CROWDED_API_TOKEN (or legacy CROWDED_API_KEY)');
  }

  return { baseUrl, token };
}

export function createCrowdedClientFromEnv(): CrowdedClient {
  return new CrowdedClient(getCrowdedClientConfigFromEnv());
}
