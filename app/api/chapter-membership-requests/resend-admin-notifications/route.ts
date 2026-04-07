import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPendingMembershipRequestForUser } from '@/lib/services/membershipRequestService';
import { notifyChapterAdminsOfMembershipRequestReminderEmailSmsOnly } from '@/lib/services/membershipRequestNotificationService';

/**
 * Cooldown for applicant-triggered admin reminder (email/SMS only). Stored in DB
 * (`last_admin_reminder_sent_at` on `chapter_membership_requests`) so it works across serverless instances.
 */
const ADMIN_REMINDER_COOLDOWN_MS = 12 * 60 * 1000;

function minutesUntilAllowed(lastSentIso: string): number {
  const elapsed = Date.now() - new Date(lastSentIso).getTime();
  const remaining = ADMIN_REMINDER_COOLDOWN_MS - elapsed;
  return Math.max(1, Math.ceil(remaining / 60_000));
}

/**
 * POST — resend new-membership-request admin email + SMS (no push) for the caller’s pending row.
 * Used from onboarding “Refresh status” when still not approved.
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    const pending = await getPendingMembershipRequestForUser(supabase, user.id);
    if (!pending) {
      return NextResponse.json(
        { error: 'No pending chapter membership request found' },
        { status: 404 }
      );
    }

    const lastSent = pending.last_admin_reminder_sent_at;
    if (lastSent) {
      const elapsed = Date.now() - new Date(lastSent).getTime();
      if (elapsed < ADMIN_REMINDER_COOLDOWN_MS) {
        const mins = minutesUntilAllowed(lastSent);
        return NextResponse.json(
          {
            error: `Please wait about ${mins} minute${mins === 1 ? '' : 's'} before sending another reminder.`,
          },
          { status: 429 }
        );
      }
    }

    const nowIso = new Date().toISOString();

    await notifyChapterAdminsOfMembershipRequestReminderEmailSmsOnly(supabase, {
      requestId: pending.id,
      chapterId: pending.chapter_id,
      applicantUserId: user.id,
    });

    const { error: updateError } = await supabase
      .from('chapter_membership_requests')
      .update({ last_admin_reminder_sent_at: nowIso })
      .eq('id', pending.id)
      .eq('status', 'pending');

    if (updateError) {
      console.error('resend-admin-notifications: failed to set last_admin_reminder_sent_at', updateError);
      return NextResponse.json(
        { error: 'Reminder was sent but could not be recorded. Please try again later if needed.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/chapter-membership-requests/resend-admin-notifications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
