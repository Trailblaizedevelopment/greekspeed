import type { CrowdedCollectIntentSummary } from '@/types/crowded';

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Normalize Crowded list/detail intent payloads (field names may vary). */
export function normalizeCrowdedCollectIntentSummary(raw: unknown): CrowdedCollectIntentSummary | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const id = str(o.id ?? o.uuid).trim();
  const contactId = str(o.contactId ?? o.contact_id).trim();
  if (!id || !contactId) {
    return null;
  }
  const paymentUrlRaw = o.paymentUrl ?? o.payment_url;
  const paymentUrl =
    typeof paymentUrlRaw === 'string' && paymentUrlRaw.trim().length > 0 ? paymentUrlRaw.trim() : null;

  return {
    id,
    contactId,
    status: str(o.status).trim() || 'unknown',
    requestedAmount: num(o.requestedAmount ?? o.requested_amount),
    paidAmount: num(o.paidAmount ?? o.paid_amount),
    paymentUrl,
    createdAt:
      typeof o.createdAt === 'string'
        ? o.createdAt
        : typeof o.created_at === 'string'
          ? o.created_at
          : null,
  };
}

/** Keep the newest intent per `contactId` (by `createdAt` desc, then id). */
export function pickLatestCrowdedIntentPerContact(
  intents: CrowdedCollectIntentSummary[]
): Map<string, CrowdedCollectIntentSummary> {
  const sorted = [...intents].sort((a, b) => {
    const ca = a.createdAt ?? '';
    const cb = b.createdAt ?? '';
    if (ca !== cb) return cb.localeCompare(ca);
    return b.id.localeCompare(a.id);
  });
  const map = new Map<string, CrowdedCollectIntentSummary>();
  for (const i of sorted) {
    if (!map.has(i.contactId)) {
      map.set(i.contactId, i);
    }
  }
  return map;
}
