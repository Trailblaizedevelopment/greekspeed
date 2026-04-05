import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailService } from '@/lib/services/emailService';
import { SMSNotificationService } from '@/lib/services/sms/smsNotificationService';
import { SMSService } from '@/lib/services/sms/smsServiceTelnyx';

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
        supabase.from('chapters').select('name').eq('id', chapterId).maybeSingle(),
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
