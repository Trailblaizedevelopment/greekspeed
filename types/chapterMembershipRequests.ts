/**
 * `public.chapter_membership_requests` — see supabase/migrations/20260404221457_chapter_membership_requests_tra567.sql
 * and `20260406120000_chapter_membership_requests_last_admin_reminder.sql` (reminder cooldown).
 */

export type ChapterMembershipRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type ChapterMembershipRequestSource = 'marketing_alumni' | 'invitation';

/** Full row from Supabase */
export interface ChapterMembershipRequest {
  id: string;
  user_id: string;
  chapter_id: string;
  status: ChapterMembershipRequestStatus;
  source: ChapterMembershipRequestSource;
  invitation_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  rejection_reason: string | null;
  applicant_email: string | null;
  applicant_full_name: string | null;
  created_at: string;
  updated_at: string;
  /** Cooldown anchor for applicant-triggered admin reminder resends (email/SMS). */
  last_admin_reminder_sent_at?: string | null;
}

/** Fields accepted when creating a request (server may set snapshots). */
export interface ChapterMembershipRequestInsert {
  user_id: string;
  chapter_id: string;
  status?: ChapterMembershipRequestStatus;
  source: ChapterMembershipRequestSource;
  invitation_id?: string | null;
  applicant_email?: string | null;
  applicant_full_name?: string | null;
}

/** Patch for resolve / admin actions */
export interface ChapterMembershipRequestUpdate {
  status?: ChapterMembershipRequestStatus;
  resolved_at?: string | null;
  resolved_by?: string | null;
  rejection_reason?: string | null;
  last_admin_reminder_sent_at?: string | null;
}
