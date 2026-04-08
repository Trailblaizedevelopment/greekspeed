/**
 * Crowded API client — server-side only (uses secret token from env).
 * @see docs/development/features/crowded_cursor_postman_session.md
 */
import type {
  CrowdedAccount,
  CrowdedChapter,
  CrowdedContact,
  CrowdedErrorBody,
  CrowdedListResponse,
  CrowdedOrganization,
  CrowdedSingleResponse,
} from '@/types/crowded';
import {
  crowdedAccountListResponseSchema,
  crowdedAccountSingleResponseSchema,
  crowdedChapterListResponseSchema,
  crowdedContactListResponseSchema,
  crowdedContactSingleResponseSchema,
  crowdedOrganizationListResponseSchema,
} from './crowded-schemas';
import { normalizeCrowdedAccountListElement } from './crowdedAccountMapping';

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
   * Low-level POST with JSON body. Use for Crowded endpoints not yet wrapped (e.g. bulk account create — confirm path with Postman).
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
  async listContacts(chapterId: string): Promise<CrowdedListResponse<CrowdedContact>> {
    const raw = await this.getJson<unknown>(`/chapters/${encodeURIComponent(chapterId)}/contacts`);
    return maybeParse(crowdedContactListResponseSchema, raw) as CrowdedListResponse<CrowdedContact>;
  }

  /** GET /api/v1/chapters/:chapterId/contacts/:contactId */
  async getContact(chapterId: string, contactId: string): Promise<CrowdedSingleResponse<CrowdedContact>> {
    const raw = await this.getJson<unknown>(
      `/chapters/${encodeURIComponent(chapterId)}/contacts/${encodeURIComponent(contactId)}`
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
