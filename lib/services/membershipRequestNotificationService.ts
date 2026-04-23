import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailService } from '@/lib/services/emailService';
import { buildPushPayload } from '@/lib/services/notificationPushPayload';
import { SMSNotificationService } from '@/lib/services/sms/smsNotificationService';
import { SMSService } from '@/lib/services/sms/smsServiceTelnyx';
import { sendPushToUser } from '@/lib/services/oneSignalPushService';
import { getEmailBaseUrl } from '@/lib/utils/urlUtils';

export interface MembershipRequestAdminRecipient {
  id: string;
  /** Empty when profile has no email (SMS-only notify). */
  email: string;
  firstName: string;
  phone: string | null;
  smsConsent: boolean;
}

function addMembershipRequestAdminRecipientRow(
  byId: Map<string, MembershipRequestAdminRecipient>,
  row: {
    id: string;
    email: string | null;
    first_name: string | null;
    phone: string | null;
    sms_consent: boolean | null;
  },
  excludeUserId: string
): void {
  if (row.id === excludeUserId) return;
  if (byId.has(row.id)) return;

  const email = row.email?.trim() ?? '';
  const phone = row.phone?.trim() ?? null;

  const firstName =
    row.first_name?.trim() ||
    (email.length > 0 ? email.split('@')[0] : null) ||
    'there';

  byId.set(row.id, {
    id: row.id,
    email,
    firstName,
    phone,
    smsConsent: row.sms_consent === true,
  });
}

/**
 * Recipients for TRA-590 / TRA-591 / TRA-593: `profiles.role` is `admin` (same `chapter_id` as the request) or
 * `governance` (chapter in `governance_chapters` or home `chapter_id`). Excludes the applicant.
 * Deduped by user id. All matching reviewers are included (for OneSignal push); email/SMS only when applicable.
 */
export async function fetchMembershipRequestAdminRecipients(
  supabase: SupabaseClient,
  chapterId: string,
  excludeUserId: string
): Promise<MembershipRequestAdminRecipient[]> {
  const byId = new Map<string, MembershipRequestAdminRecipient>();

  const { data: chapterAdmins, error: adminsError } = await supabase
    .from('profiles')
    .select('id, email, first_name, phone, sms_consent')
    .eq('role', 'admin')
    .eq('chapter_id', chapterId);

  if (adminsError) {
    console.error('fetchMembershipRequestAdminRecipients (admin):', adminsError);
  } else {
    for (const row of chapterAdmins ?? []) {
      addMembershipRequestAdminRecipientRow(byId, row, excludeUserId);
    }
  }

  const { data: govLinks, error: linksError } = await supabase
    .from('governance_chapters')
    .select('user_id')
    .eq('chapter_id', chapterId);

  if (linksError) {
    console.error('fetchMembershipRequestAdminRecipients (governance_chapters):', linksError);
  }

  const { data: govHome, error: homeError } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'governance')
    .eq('chapter_id', chapterId);

  if (homeError) {
    console.error('fetchMembershipRequestAdminRecipients (governance home):', homeError);
  }

  const govIds = new Set<string>();
  for (const row of govLinks ?? []) {
    govIds.add(row.user_id);
  }
  for (const row of govHome ?? []) {
    govIds.add(row.id);
  }

  if (govIds.size > 0) {
    const { data: govProfiles, error: govProfilesError } = await supabase
      .from('profiles')
      .select('id, email, first_name, phone, sms_consent')
      .eq('role', 'governance')
      .in('id', [...govIds]);

    if (govProfilesError) {
      console.error('fetchMembershipRequestAdminRecipients (governance profiles):', govProfilesError);
    } else {
      for (const row of govProfiles ?? []) {
        addMembershipRequestAdminRecipientRow(byId, row, excludeUserId);
      }
    }
  }

  return [...byId.values()];
}

interface MembershipRequestAdminNotifyPayload {
  requestId: string;
  chapterId: string;
  applicantUserId: string;
  chapterName: string;
  applicantName: string;
  reviewUrl: string;
  recipients: MembershipRequestAdminRecipient[];
}

async function loadMembershipRequestAdminNotificationPayload(
  supabase: SupabaseClient,
  params: { requestId: string; chapterId: string; applicantUserId: string }
): Promise<MembershipRequestAdminNotifyPayload> {
  const { requestId, chapterId, applicantUserId } = params;

  const [chapterResult, applicantResult, recipients] = await Promise.all([
    supabase.from('spaces').select('name').eq('id', chapterId).maybeSingle(),
    supabase
      .from('profiles')
      .select('email, first_name, last_name, full_name')
      .eq('id', applicantUserId)
      .maybeSingle(),
    fetchMembershipRequestAdminRecipients(supabase, chapterId, applicantUserId),
  ]);

  const chapterName = chapterResult.data?.name ?? 'Your chapter';
  const applicant = applicantResult.data;
  const nameFromParts = [applicant?.first_name, applicant?.last_name]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  const applicantName =
    applicant?.full_name?.trim() ||
    nameFromParts ||
    applicant?.first_name?.trim() ||
    applicant?.email?.split('@')[0] ||
    'A member';

  const baseUrl = getEmailBaseUrl().replace(/\/$/, '');
  const reviewUrl = `${baseUrl}/dashboard/requests?request=${encodeURIComponent(requestId)}`;

  return {
    requestId,
    chapterId,
    applicantUserId,
    chapterName,
    applicantName,
    reviewUrl,
    recipients,
  };
}

async function sendMembershipRequestAdminEmailAndSms(
  payload: MembershipRequestAdminNotifyPayload
): Promise<void> {
  const { chapterName, applicantName, reviewUrl, recipients, chapterId } = payload;

  const emailTasks = recipients
    .filter((r) => r.email.length > 0)
    .map((r) =>
      EmailService.sendNewMembershipRequestAdminEmail({
        to: r.email,
        adminFirstName: r.firstName,
        chapterName,
        applicantName,
        reviewUrl,
      }).catch((err) =>
        console.error('New membership request admin email failed:', { to: r.email, err })
      )
    );

  const smsTasks = recipients
    .filter((r) => r.smsConsent && r.phone)
    .filter((r) => SMSService.isValidPhoneNumber(r.phone!))
    .map((r) =>
      SMSNotificationService.sendNewMembershipRequestAdminNotification(
        r.phone!,
        r.firstName,
        chapterName,
        applicantName,
        r.id,
        chapterId,
        { link: reviewUrl }
      ).catch((err) =>
        console.error('New membership request admin SMS failed:', { userId: r.id, err })
      )
    );

  await Promise.all([...emailTasks, ...smsTasks]);
}

async function sendMembershipRequestAdminPushOnly(
  payload: MembershipRequestAdminNotifyPayload
): Promise<void> {
  const { requestId, applicantName, chapterName, recipients } = payload;

  const pushPayload = buildPushPayload('membership_request_admin', {
    membershipRequestId: requestId,
    membershipApplicantName: applicantName,
    chapterName,
  });

  const pushTasks = recipients.map((r) =>
    sendPushToUser(r.id, pushPayload).catch((err) =>
      console.error('New membership request admin push failed:', { userId: r.id, err })
    )
  );

  await Promise.all(pushTasks);
}

/**
 * Resend TRA-590 / TRA-591 templates to the same admin/governance recipients as new-request notify,
 * without OneSignal push (used from “Refresh status” when still pending). Awaited by API route.
 */
export async function notifyChapterAdminsOfMembershipRequestReminderEmailSmsOnly(
  supabase: SupabaseClient,
  params: { requestId: string; chapterId: string; applicantUserId: string }
): Promise<void> {
  const payload = await loadMembershipRequestAdminNotificationPayload(supabase, params);
  await sendMembershipRequestAdminEmailAndSms(payload);
}

/**
 * Notify platform admins / governance when a new pending request is created
 * (TRA-590 email, TRA-591 SMS, TRA-593 OneSignal push when configured). Fire-and-forget.
 */
export function notifyChapterAdminsOfNewMembershipRequest(
  supabase: SupabaseClient,
  params: {
    requestId: string;
    chapterId: string;
    applicantUserId: string;
  }
): void {
  void (async () => {
    try {
      const payload = await loadMembershipRequestAdminNotificationPayload(supabase, params);
      await sendMembershipRequestAdminEmailAndSms(payload);
      await sendMembershipRequestAdminPushOnly(payload);
    } catch (err) {
      console.error('notifyChapterAdminsOfNewMembershipRequest:', err);
    }
  })();
}

/**
 * Notify applicant after approve/reject (TRA-575). Fire-and-forget from API routes; errors are logged only.
 */
export function notifyApplicantOfMembershipDecision(
  supabase: SupabaseClient,
  params: {
    applicantUserId: string;
    chapterId: string;
    approved: boolean;
    rejectionReason?: string | null;
  }
): void {
  const { applicantUserId, chapterId, approved, rejectionReason } = params;

  void (async () => {
    try {
      const [chapterResult, profileResult] = await Promise.all([
        supabase.from('spaces').select('name').eq('id', chapterId).maybeSingle(),
        supabase
          .from('profiles')
          .select('email, first_name, phone, sms_consent')
          .eq('id', applicantUserId)
          .maybeSingle(),
      ]);

      const chapterName = chapterResult.data?.name ?? 'Your chapter';
      const profile = profileResult.data;
      const firstName =
        profile?.first_name?.trim() ||
        profile?.email?.split('@')[0] ||
        'there';
      const email = profile?.email?.trim();

      if (email) {
        EmailService.sendMembershipRequestDecisionEmail({
          to: email,
          firstName,
          chapterName,
          approved,
          rejectionReason: rejectionReason ?? null,
        }).catch((err) =>
          console.error('Membership decision email failed:', err)
        );
      }

      if (profile?.phone && profile.sms_consent === true) {
        if (SMSService.isValidPhoneNumber(profile.phone)) {
          SMSNotificationService.sendMembershipDecisionNotification(
            profile.phone,
            firstName,
            chapterName,
            approved,
            applicantUserId,
            chapterId
          ).catch((err) =>
            console.error('Membership decision SMS failed:', err)
          );
        } else {
          console.warn('Membership decision SMS skipped: invalid phone', {
            applicantUserId,
          });
        }
      }
    } catch (err) {
      console.error('notifyApplicantOfMembershipDecision:', err);
    }
  })();
}
