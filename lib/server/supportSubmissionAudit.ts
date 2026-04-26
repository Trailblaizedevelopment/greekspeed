import type { SupabaseClient } from '@supabase/supabase-js';

export interface SupportSubmissionAuditRow {
  user_id: string;
  chapter_id: string | null;
  /** Snapshot of profiles.chapter when chapters table is not available. */
  chapter_name: string | null;
  category: string;
  subject: string;
  body: string;
  reporter_email: string | null;
  page_url: string | null;
  user_agent: string | null;
}

/**
 * Persist a support submission for audit (TRA-631). Call only after email send succeeds.
 * Failures are logged only — does not throw (caller already returned success to client).
 */
export async function recordSupportSubmissionAudit(
  supabase: SupabaseClient,
  row: SupportSubmissionAuditRow
): Promise<void> {
  const { error } = await supabase.from('support_submissions').insert(row);
  if (error) {
    console.error('[support audit] insert failed:', error.message);
  }
}
