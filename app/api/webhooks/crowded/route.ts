import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCrowdedClientFromEnv } from '@/lib/services/crowded/crowded-client';
import {
  crowdedWebhookSkipSignatureVerify,
  verifyCrowdedWebhookSignature,
} from '@/lib/services/crowded/crowdedWebhookSignature';
import { processCrowdedWebhookEvent } from '@/lib/services/crowded/handleCrowdedWebhookEvent';

export const dynamic = 'force-dynamic';

/**
 * Crowded Collect webhooks (TRA-416). Configure `data.url` in Crowded to this path.
 * @see docs/development/features/crowded_cursor_postman_session.md
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CROWDED_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('CROWDED_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const rawBody = await request.text();

  if (!crowdedWebhookSkipSignatureVerify()) {
    if (!verifyCrowdedWebhookSignature(rawBody, request.headers, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } else {
    console.warn('CROWDED_WEBHOOK_SKIP_SIGNATURE_VERIFY=true — request not signature-verified');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let crowded;
  try {
    crowded = createCrowdedClientFromEnv();
  } catch (e) {
    console.error('Crowded client init failed:', e);
    return NextResponse.json({ error: 'Crowded client unavailable' }, { status: 503 });
  }

  const result = await processCrowdedWebhookEvent({
    supabase,
    crowded,
    parsed,
    rawBody,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    duplicate: result.duplicate === true,
    detail: result.detail,
  });
}
