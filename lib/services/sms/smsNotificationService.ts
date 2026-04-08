import { SMSService } from './smsServiceTelnyx';
import { SMSMessageFormatter } from './smsMessageFormatter';
import { createClient } from '@supabase/supabase-js';
import { toGsmSafe } from '@/lib/utils/smsUtils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://trailblaize.net';

interface SMSNotificationData {
  userId: string;
  chapterId: string;
  phoneNumber: string;
  messageType: string;
  messageContent: string;
}

export class SMSNotificationService {

  /**
   * Returns true if this user has ever received an SMS (any row in sms_notification_logs with status = 'sent').
   * Used to show full compliance only on first-ever message.
   */
  private static async hasReceivedSmsBefore(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('sms_notification_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'sent')
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('Failed to check sms_notification_logs:', error);
      return true; // assume not first so we don't omit compliance if DB fails
    }
    return !!data;
  }

  // Log SMS attempt to database
  private static async logSMS(data: SMSNotificationData, success: boolean, messageId?: string, error?: string) {
    try {
      await supabase.from('sms_notification_logs').insert({
        user_id: data.userId,
        chapter_id: data.chapterId,
        message_type: data.messageType,
        message_content: data.messageContent,
        phone_number: data.phoneNumber,
        status: success ? 'sent' : 'failed',
        telnyx_id: messageId,
        error: error
      });
    } catch (logError) {
      console.error('Failed to log SMS:', logError);
    }
  }

  // For announcements: full compliance only on first-ever SMS (same as other flows)
  static async sendAnnouncementNotification(
    phoneNumber: string,
    userName: string,
    announcementTitle: string,
    userId: string,
    chapterId: string,
    options?: { contentSummary?: string; link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard/announcements`;
    const detail = toGsmSafe((options?.contentSummary ?? announcementTitle).slice(0, 60));
    const headline = toGsmSafe(announcementTitle.slice(0, 40));

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      detail,
      'Read more',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      { userId, chapterId, phoneNumber: formattedPhone, messageType: 'announcement', messageContent: messageParts.fullMessage },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  // For events: full compliance only on first-ever SMS
  static async sendEventNotification(
    phoneNumber: string,
    userName: string,
    eventTitle: string,
    eventDate: string,
    userId: string,
    chapterId: string,
    options?: { link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard`;
    const headline = toGsmSafe(eventTitle.slice(0, 50));
    const detail = toGsmSafe(eventDate.slice(0, 40));

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      detail,
      'RSVP',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      { userId, chapterId, phoneNumber: formattedPhone, messageType: 'event', messageContent: messageParts.fullMessage },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  // For messages: full compliance only on first-ever SMS
  static async sendMessageNotification(
    phoneNumber: string,
    userName: string,
    senderName: string,
    preview: string,
    userId: string,
    chapterId: string,
    options?: { link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard/messages`;
    const headline = `New message from ${toGsmSafe(senderName.slice(0, 30))}`;

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      'Tap to reply',
      'Open',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      { userId, chapterId, phoneNumber: formattedPhone, messageType: 'message', messageContent: messageParts.fullMessage },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  // For connection requests: full compliance only on first-ever SMS
  static async sendConnectionRequestNotification(
    phoneNumber: string,
    userName: string,
    requesterName: string,
    userId: string,
    chapterId: string,
    options?: { link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard/notifications`;
    const headline = `${toGsmSafe(requesterName.slice(0, 30))} wants to connect`;

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      'View profile to accept',
      'View',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      { userId, chapterId, phoneNumber: formattedPhone, messageType: 'connection_request', messageContent: messageParts.fullMessage },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  /** Chapter membership approved or rejected (alumni gate queue). */
  static async sendMembershipDecisionNotification(
    phoneNumber: string,
    userName: string,
    chapterName: string,
    approved: boolean,
    userId: string,
    chapterId: string,
    options?: { link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard`;
    const chapterShort = toGsmSafe(chapterName.slice(0, 28));
    const headline = approved
      ? `${chapterShort}: you're approved on Trailblaize`
      : `${chapterShort}: membership not approved`;

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      approved ? 'Open the app to continue' : 'Sign in for details',
      'Open',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      {
        userId,
        chapterId,
        phoneNumber: formattedPhone,
        messageType: 'membership_decision',
        messageContent: messageParts.fullMessage,
      },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  /** New pending membership request — SMS to platform admin / governance (TRA-591). */
  static async sendNewMembershipRequestAdminNotification(
    phoneNumber: string,
    adminFirstName: string,
    chapterName: string,
    applicantName: string,
    userId: string,
    chapterId: string,
    options?: { link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard/requests`;
    const chapterShort = toGsmSafe(chapterName.slice(0, 22));
    const applicantShort = toGsmSafe(applicantName.slice(0, 24));
    const headline = `${chapterShort}: new membership request`;
    const detail = `${applicantShort} wants to join`;

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      detail,
      'Review',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      {
        userId,
        chapterId,
        phoneNumber: formattedPhone,
        messageType: 'membership_request_admin_new',
        messageContent: messageParts.fullMessage,
      },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  // For connection accepted: full compliance only on first-ever SMS
  static async sendConnectionAcceptedNotification(
    phoneNumber: string,
    userName: string,
    accepterName: string,
    userId: string,
    chapterId: string,
    options?: { link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard/notifications`;
    const headline = `${toGsmSafe(accepterName.slice(0, 30))} accepted your request`;

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      'Say hello',
      'Open',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      { userId, chapterId, phoneNumber: formattedPhone, messageType: 'connection_accepted', messageContent: messageParts.fullMessage },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  // Post comment: notify post author when someone comments (Option A: phone + sms_consent only)
  static async sendPostCommentNotification(
    phoneNumber: string,
    userName: string,
    actorName: string,
    contentPreview: string | undefined,
    userId: string,
    chapterId: string,
    options?: { postId: string; link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard/post/${options?.postId ?? ''}`;
    const headline = `${toGsmSafe(actorName.slice(0, 30))} commented on your post`;
    const detail = contentPreview ? toGsmSafe(contentPreview.slice(0, 50)) : 'View post';

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      detail,
      'View',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      { userId, chapterId, phoneNumber: formattedPhone, messageType: 'post_comment', messageContent: messageParts.fullMessage },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  // Comment reply: notify parent comment author when someone replies
  static async sendCommentReplyNotification(
    phoneNumber: string,
    userName: string,
    actorName: string,
    contentPreview: string | undefined,
    userId: string,
    chapterId: string,
    options?: { postId: string; link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard/post/${options?.postId ?? ''}`;
    const headline = `${toGsmSafe(actorName.slice(0, 30))} replied to your comment`;

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      'View post',
      'View',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      { userId, chapterId, phoneNumber: formattedPhone, messageType: 'comment_reply', messageContent: messageParts.fullMessage },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  // Post like: notify post author when someone likes their post
  static async sendPostLikeNotification(
    phoneNumber: string,
    userName: string,
    actorName: string,
    userId: string,
    chapterId: string,
    options?: { postId: string; link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard/post/${options?.postId ?? ''}`;
    const headline = `${toGsmSafe(actorName.slice(0, 30))} liked your post`;

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      'View post',
      'View',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      { userId, chapterId, phoneNumber: formattedPhone, messageType: 'post_like', messageContent: messageParts.fullMessage },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  // Comment like: notify comment author when someone likes their comment
  static async sendCommentLikeNotification(
    phoneNumber: string,
    userName: string,
    actorName: string,
    userId: string,
    chapterId: string,
    options?: { postId: string; link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard/post/${options?.postId ?? ''}`;
    const headline = `${toGsmSafe(actorName.slice(0, 30))} liked your comment`;

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      'View post',
      'View',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      { userId, chapterId, phoneNumber: formattedPhone, messageType: 'comment_like', messageContent: messageParts.fullMessage },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  // Inactivity reminder: re-engage users who have not been active for 30+ days
  static async sendInactivityReminderNotification(
    phoneNumber: string,
    userName: string,
    userId: string,
    chapterId: string,
    options?: { link?: string }
  ): Promise<boolean> {
    const formattedPhone = SMSService.formatPhoneNumber(phoneNumber);
    const link = options?.link ?? `${BASE_URL}/dashboard`;
    const headline = 'We miss you on Trailblaize';

    const isFirst = !(await this.hasReceivedSmsBefore(userId));
    const complianceLevel = isFirst ? 'full' : 'none';

    const messageParts = SMSMessageFormatter.formatShortMessage(
      headline,
      "Your chapter is here when you're ready.",
      'Open',
      link,
      { complianceLevel }
    );

    const result = await SMSService.sendSMS({ to: formattedPhone, body: messageParts.fullMessage });
    await this.logSMS(
      { userId, chapterId, phoneNumber: formattedPhone, messageType: 'inactivity_reminder', messageContent: messageParts.fullMessage },
      result.success,
      result.messageId,
      result.error
    );
    return result.success;
  }

  /**
   * Batch check: returns the set of user IDs that have at least one 'sent' row in sms_notification_logs.
   * Used by the announcements route to split first-time vs returning recipients (one query instead of N).
   */
  static async getUserIdSetThatHaveReceivedSms(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const { data, error } = await supabase
      .from('sms_notification_logs')
      .select('user_id')
      .in('user_id', userIds)
      .eq('status', 'sent');
    if (error) {
      console.error('Failed to batch check sms_notification_logs:', error);
      return new Set(); // assume none so everyone gets full compliance if DB fails
    }
    const set = new Set<string>();
    for (const row of data ?? []) {
      if (row.user_id) set.add(row.user_id);
    }
    return set;
  }

  /**
   * Log announcement recipients to sms_notification_logs so future "first ever" checks include them.
   * Call after a successful bulk announcement send. Inserts one row per recipient with status 'sent'.
   */
  static async recordAnnouncementSmsRecipients(
    recipients: Array<{ userId: string; chapterId: string; phoneNumber: string }>,
    messageContent: string
  ): Promise<void> {
    if (recipients.length === 0) return;
    try {
      await supabase.from('sms_notification_logs').insert(
        recipients.map(({ userId, chapterId, phoneNumber }) => ({
          user_id: userId,
          chapter_id: chapterId,
          phone_number: phoneNumber,
          message_type: 'announcement',
          message_content: messageContent,
          status: 'sent',
        }))
      );
    } catch (logError) {
      console.error('Failed to record announcement SMS recipients:', logError);
    }
  }
}
