import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrowdedClient } from './crowded-client';
import { upsertCrowdedTransactionForCollectWebhook } from './reconcileCrowdedCollectWebhook';

const COLLECTION_ID_KEYS = new Set([
  'collectionId',
  'collection_id',
  'collectCollectionId',
  'collect_collection_id',
]);
const CONTACT_ID_KEYS = new Set(['contactId', 'contact_id']);
const AMOUNT_MINOR_KEYS = new Set([
  'amountMinor',
  'amount_minor',
  'amountCents',
  'amount_cents',
  'totalMinor',
  'total_minor',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function extractByKeySet(obj: unknown, keySet: Set<string>): string | null {
  if (!isRecord(obj)) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (keySet.has(k) && typeof v === 'string' && v.trim().length > 0) {
      return v.trim();
    }
  }
  for (const v of Object.values(obj)) {
    if (v !== null && typeof v === 'object') {
      const found = extractByKeySet(v, keySet);
      if (found) return found;
    }
  }
  return null;
}

function extractAmountMinor(obj: unknown): number | null {
  const direct = extractByKeySet(obj, AMOUNT_MINOR_KEYS);
  if (direct) {
    const n = Number(direct);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  if (!isRecord(obj)) return null;
  for (const v of Object.values(obj)) {
    if (v !== null && typeof v === 'object') {
      const n = extractAmountMinor(v);
      if (n != null) return n;
    }
  }
  return null;
}

/** Best-effort stable id for at_least_once dedupe. */
export function buildCrowdedWebhookIdempotencyKey(
  parsed: Record<string, unknown>,
  rawBody: string
): string {
  const tryKeys = ['id', 'eventId', 'event_id', 'deliveryId', 'delivery_id', 'requestId'];
  for (const k of tryKeys) {
    const v = parsed[k];
    if (typeof v === 'string' && v.trim()) return `crowded:${k}:${v.trim()}`;
  }
  if (isRecord(parsed.data)) {
    for (const k of tryKeys) {
      const v = parsed.data[k];
      if (typeof v === 'string' && v.trim()) return `crowded:data.${k}:${v.trim()}`;
    }
  }
  const hash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  return `crowded:body:${hash}`;
}

export function extractCrowdedWebhookEventType(parsed: Record<string, unknown>): string {
  const top = parsed.type ?? parsed.event ?? parsed.eventType;
  if (typeof top === 'string' && top.trim()) return top.trim();
  if (isRecord(parsed.data)) {
    const d = parsed.data.type ?? parsed.data.event;
    if (typeof d === 'string' && d.trim()) return d.trim();
  }
  return 'unknown';
}

const NON_PAYABLE = new Set(['paid', 'exempt', 'waived']);

export type CrowdedWebhookProcessResult =
  | { ok: true; duplicate?: boolean; detail?: string }
  | { ok: false; error: string };

/**
 * Inserts idempotency row, then handles known event types (dues / Collect).
 */
export async function processCrowdedWebhookEvent(params: {
  supabase: SupabaseClient;
  crowded: CrowdedClient;
  parsed: Record<string, unknown>;
  rawBody: string;
}): Promise<CrowdedWebhookProcessResult> {
  const { supabase, crowded, parsed, rawBody } = params;
  const eventType = extractCrowdedWebhookEventType(parsed);
  const idempotencyKey = buildCrowdedWebhookIdempotencyKey(parsed, rawBody);

  const { error: insertError } = await supabase.from('crowded_webhook_events').insert({
    idempotency_key: idempotencyKey,
    event_type: eventType,
    payload: parsed as unknown as Record<string, never>,
    processing_status: 'received',
  });

  if (insertError) {
    const msg = insertError.message ?? '';
    const code = (insertError as { code?: string }).code;
    if (code === '23505' || msg.toLowerCase().includes('duplicate')) {
      return { ok: true, duplicate: true };
    }
    console.error('crowded_webhook_events insert failed:', insertError);
    return { ok: false, error: 'Failed to record webhook event' };
  }

  const mark = async (
    status: 'processed' | 'skipped' | 'error',
    errorMessage?: string
  ) => {
    await supabase
      .from('crowded_webhook_events')
      .update({
        processing_status: status,
        error_message: errorMessage ?? null,
      })
      .eq('idempotency_key', idempotencyKey);
  };

  try {
    if (eventType === 'collect.payment.succeeded') {
      const result = await handleCollectPaymentSucceeded(supabase, crowded, parsed);
      await mark(result.skipped ? 'skipped' : 'processed', result.message);
      return { ok: true, detail: result.message };
    }

    if (eventType === 'collect.payment.failed') {
      const failResult = await handleCollectPaymentFailed(supabase, crowded, parsed);
      await mark(
        failResult.skipped ? 'skipped' : 'processed',
        failResult.message
      );
      return { ok: true, detail: failResult.message };
    }

    await mark('skipped', `unhandled event type: ${eventType}`);
    return { ok: true, detail: `unhandled:${eventType}` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Crowded webhook handler error:', e);
    await mark('error', message);
    return { ok: false, error: message };
  }
}

async function handleCollectPaymentSucceeded(
  supabase: SupabaseClient,
  crowded: CrowdedClient,
  parsed: Record<string, unknown>
): Promise<{ skipped: boolean; message: string }> {
  const collectionId = extractByKeySet(parsed, COLLECTION_ID_KEYS);
  const contactId = extractByKeySet(parsed, CONTACT_ID_KEYS);
  const amountMinor = extractAmountMinor(parsed);

  if (!collectionId || !contactId) {
    return {
      skipped: true,
      message: 'missing collectionId or contactId in payload (shape TBD — capture live POST)',
    };
  }

  const { data: cycle, error: cycleErr } = await supabase
    .from('dues_cycles')
    .select('id, chapter_id')
    .eq('crowded_collection_id', collectionId)
    .maybeSingle();

  if (cycleErr || !cycle?.chapter_id) {
    return { skipped: true, message: 'no dues_cycle for crowded_collection_id' };
  }

  const { data: chapter, error: chErr } = await supabase
    .from('chapters')
    .select('crowded_chapter_id')
    .eq('id', cycle.chapter_id)
    .maybeSingle();

  if (chErr || !chapter?.crowded_chapter_id?.trim()) {
    return { skipped: true, message: 'chapter missing crowded_chapter_id' };
  }

  const crowdedChapterId = chapter.crowded_chapter_id.trim();

  const txnRes = await upsertCrowdedTransactionForCollectWebhook({
    supabase,
    crowded,
    trailblaizeChapterId: cycle.chapter_id,
    parsed,
    collectionId,
    contactId,
    amountMinor,
    status: 'succeeded',
  });
  if (!txnRes.ok) {
    console.warn('crowded_transactions (collect.payment.succeeded):', txnRes.reason);
  }

  let contactEmail: string;
  try {
    const res = await crowded.getContact(crowdedChapterId, contactId);
    const email = res.data?.email?.trim().toLowerCase();
    if (!email) {
      return { skipped: true, message: 'Crowded contact has no email' };
    }
    contactEmail = email;
  } catch (e) {
    console.error('Crowded getContact failed:', e);
    return { skipped: true, message: 'Crowded getContact failed' };
  }

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('chapter_id', cycle.chapter_id)
    .eq('email', contactEmail)
    .maybeSingle();

  if (profErr || !profile?.id) {
    return { skipped: true, message: 'no profile match for contact email in chapter' };
  }

  const { data: assignment, error: assignErr } = await supabase
    .from('dues_assignments')
    .select('id, user_id, status, amount_assessed, amount_due, amount_paid, dues_cycle_id')
    .eq('dues_cycle_id', cycle.id)
    .eq('user_id', profile.id)
    .maybeSingle();

  if (assignErr || !assignment) {
    return { skipped: true, message: 'no dues_assignment for user+cycle' };
  }

  const status = typeof assignment.status === 'string' ? assignment.status : '';
  if (NON_PAYABLE.has(status)) {
    return { skipped: true, message: 'assignment not payable' };
  }

  const due = Number(assignment.amount_due);
  const paid = Number(assignment.amount_paid);
  const assessed = Number(assignment.amount_assessed);
  if (!Number.isFinite(due) || !Number.isFinite(paid) || !Number.isFinite(assessed)) {
    return { skipped: true, message: 'invalid assignment amounts' };
  }

  /** `dues_assignments` amounts are USD dollars (see `/api/dues/pay`). Crowded payloads often use minor units. */
  const paymentDollars =
    amountMinor != null && amountMinor >= 0 ? amountMinor / 100 : due;
  const newPaid = paid + paymentDollars;
  const newDue = Math.max(0, due - paymentDollars);
  const newStatus = newDue <= 0.009 ? 'paid' : status;

  const { error: updErr } = await supabase
    .from('dues_assignments')
    .update({
      amount_paid: newPaid,
      amount_due: newDue,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignment.id);

  if (updErr) {
    throw new Error(`dues_assignments update failed: ${updErr.message}`);
  }

  const { error: profileUpdErr } = await supabase
    .from('profiles')
    .update({
      current_dues_amount: newDue,
      dues_status: newStatus,
      last_dues_assignment_date: new Date().toISOString(),
    })
    .eq('id', profile.id);

  if (profileUpdErr) {
    console.error('profiles update after Crowded payment:', profileUpdErr);
  }

  const { error: ledgerErr } = await supabase.from('payments_ledger').insert({
    user_id: profile.id,
    dues_cycle_id: cycle.id,
    type: 'dues',
    status: 'succeeded',
    amount: paymentDollars,
  });
  if (ledgerErr) {
    console.error('payments_ledger insert (non-fatal):', ledgerErr);
  }

  return {
    skipped: false,
    message: `updated assignment ${assignment.id} status=${newStatus}`,
  };
}

async function handleCollectPaymentFailed(
  supabase: SupabaseClient,
  crowded: CrowdedClient,
  parsed: Record<string, unknown>
): Promise<{ skipped: boolean; message: string }> {
  const collectionId = extractByKeySet(parsed, COLLECTION_ID_KEYS);
  const contactId = extractByKeySet(parsed, CONTACT_ID_KEYS);
  const amountMinor = extractAmountMinor(parsed);

  if (!collectionId || !contactId) {
    return {
      skipped: true,
      message: 'collect.payment.failed: missing collectionId or contactId',
    };
  }

  const { data: cycle, error: cycleErr } = await supabase
    .from('dues_cycles')
    .select('id, chapter_id')
    .eq('crowded_collection_id', collectionId)
    .maybeSingle();

  if (cycleErr || !cycle?.chapter_id) {
    return {
      skipped: true,
      message: 'collect.payment.failed: no dues_cycle for crowded_collection_id',
    };
  }

  const txnRes = await upsertCrowdedTransactionForCollectWebhook({
    supabase,
    crowded,
    trailblaizeChapterId: cycle.chapter_id,
    parsed,
    collectionId,
    contactId,
    amountMinor,
    status: 'failed',
  });

  if (!txnRes.ok) {
    return { skipped: true, message: `collect.payment.failed: ${txnRes.reason}` };
  }

  return {
    skipped: false,
    message: 'collect.payment.failed: recorded crowded_transactions row',
  };
}
