import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cooldown between successful support submissions for the same user.
 * Env: SUPPORT_SUBMISSION_COOLDOWN_SEC (30–86400), or 0 to disable limiter.
 * SUPPORT_RATE_LIMIT_DISABLED=true disables checks (e.g. load tests only).
 */
export function getSupportSubmissionCooldownSeconds(): number {
  if (process.env.SUPPORT_RATE_LIMIT_DISABLED === 'true') {
    return 0;
  }
  const raw = process.env.SUPPORT_SUBMISSION_COOLDOWN_SEC;
  if (raw === undefined || raw === '') {
    return 120;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return 120;
  }
  if (parsed <= 0) {
    return 0;
  }
  return Math.min(Math.max(parsed, 30), 86_400);
}

export async function checkSupportSubmissionCooldown(
  supabase: SupabaseClient,
  userId: string,
  cooldownSec: number
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  if (cooldownSec <= 0) {
    return { allowed: true };
  }

  const { data, error } = await supabase
    .from('support_submission_rate')
    .select('last_submitted_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[support rate] read skipped:', error.message);
    return { allowed: true };
  }

  const lastAt = data?.last_submitted_at;
  if (!lastAt) {
    return { allowed: true };
  }

  const lastMs = new Date(lastAt).getTime();
  const elapsedSec = (Date.now() - lastMs) / 1000;
  if (elapsedSec >= cooldownSec) {
    return { allowed: true };
  }

  const retryAfterSec = Math.max(1, Math.ceil(cooldownSec - elapsedSec));
  return { allowed: false, retryAfterSec };
}

export async function recordSuccessfulSupportSubmission(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase.from('support_submission_rate').upsert(
    { user_id: userId, last_submitted_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) {
    console.error('[support rate] upsert failed:', error.message);
  }
}
