/**
 * Minimal Crowded Collect API helpers for scripts and server routes.
 * Contract: POST /api/v1/chapters/:chapterId/collections/:collectionId/intents
 * Body: { data: { contactId, requestedAmount, payerIp, userConsented, successUrl?, failureUrl? } }
 */

import { crowdedApiAuthHeaders } from './crowded-client';

export type CrowdedCreateIntentData = {
  contactId: string;
  requestedAmount: number;
  payerIp: string;
  userConsented: boolean;
  successUrl?: string | null;
  failureUrl?: string | null;
};

export function crowdedApiBaseUrl(): string {
  const raw = process.env.CROWDED_API_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  return 'https://sandbox-api.crowdedfinance.com';
}

export function crowdedBearerToken(): string {
  const t = process.env.CROWDED_API_TOKEN?.trim() || process.env.CROWDED_API_KEY?.trim();
  if (!t) {
    throw new Error('Missing CROWDED_API_TOKEN or CROWDED_API_KEY in environment');
  }
  return t;
}

export async function crowdedFetchJson(params: {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}): Promise<{ status: number; json: unknown }> {
  const base = crowdedApiBaseUrl();
  const url = `${base}/api/v1${params.path.startsWith('/') ? params.path : `/${params.path}`}`;
  const res = await fetch(url, {
    method: params.method,
    headers: {
      ...crowdedApiAuthHeaders(crowdedBearerToken()),
      Accept: 'application/json',
      ...(params.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _parseError: true, raw: text.slice(0, 2000) };
  }
  return { status: res.status, json };
}

export async function createCrowdedCollectIntent(params: {
  crowdedChapterId: string;
  collectionId: string;
  data: CrowdedCreateIntentData;
}): Promise<{ status: number; json: unknown }> {
  const path = `/chapters/${params.crowdedChapterId}/collections/${params.collectionId}/intents`;
  return crowdedFetchJson({
    method: 'POST',
    path,
    body: { data: params.data },
  });
}
