/**
 * Notification test runner: sends or builds each notification type with sample data.
 * Used by scripts/test-notifications.ts for local testing and dry-run preview.
 */

import { EmailService } from '@/lib/services/emailService';
import { SMSNotificationService } from '@/lib/services/sms/smsNotificationService';
import { SMSService } from '@/lib/services/sms/smsServiceTelnyx';
import { SMSMessageFormatter } from '@/lib/services/sms/smsMessageFormatter';
import { NOTIFICATION_TYPES, type NotificationType, EMAIL_EVENT_TYPES, SMS_EVENT_TYPES } from '@/lib/services/notificationTypes';

const TEST_USER_ID = 'test-user-id';
const TEST_CHAPTER_ID = 'test-chapter-id';
const TEST_CONNECTION_ID = 'test-connection-id-123';
const TEST_POST_ID = 'test-post-id';

const SAMPLE = {
  firstName: 'Jordan',
  userName: 'Jordan',
  chapterName: 'Alpha Beta Gamma',
  actorFirstName: 'Alex',
  actorLastName: 'Smith',
  actorAvatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
  title: 'Spring Formal 2025',
  content: 'Join us this Saturday at 8 PM. Dress code: semi-formal. RSVP by Thursday.',
  summary: 'Join us this Saturday at 8 PM. Dress code: semi-formal.',
  eventTitle: 'Chapter Formal',
  eventDescription: 'Annual chapter formal dinner and dance.',
  eventLocation: 'Grand Ballroom, Student Center',
  eventStartTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
  eventEndTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
  eventDate: 'Sat, Mar 15, 2025, 8:00 PM',
  messagePreview: 'Hey, are you going to the formal?',
  connectionMessage: 'Would love to connect and catch up!',
  resetLink: 'https://app.example.com/auth/reset-password?token=test-token',
  timestamp: new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }),
};

export interface NotificationTestOptions {
  type: NotificationType;
  toEmail: string;
  toPhone: string;
  sendEmail: boolean;
  sendSms: boolean;
  dryRun: boolean;
}

export interface DryRunResult {
  type: NotificationType;
  email?: {
    subject: string;
    templateData?: Record<string, unknown>;
    bodyDescription?: string;
  };
  sms?: {
    body: string;
  };
}

export interface SendResult {
  type: NotificationType;
  emailSent?: boolean;
  smsSent?: boolean;
  emailError?: string;
  smsError?: string;
}

const TEST_BASE_URL = 'https://trailblaize.net';

function buildSmsBodyForType(type: NotificationType): string {
  switch (type) {
    case 'chapter_announcement': {
      const headline = SAMPLE.title.slice(0, 40);
      const detail = SAMPLE.content.slice(0, 60).replace(/\s+/g, ' ').trim();
      const parts = SMSMessageFormatter.formatShortMessage(
        headline,
        detail,
        'Read more',
        `${TEST_BASE_URL}/dashboard/announcements`,
        { complianceLevel: 'full' }
      );
      return parts.fullMessage;
    }
    case 'new_event': {
      const headline = SAMPLE.eventTitle.slice(0, 50);
      const detail = SAMPLE.eventDate.slice(0, 40);
      const parts = SMSMessageFormatter.formatShortMessage(
        headline,
        detail,
        'RSVP',
        `${TEST_BASE_URL}/dashboard`,
        { complianceLevel: 'short' }
      );
      return parts.fullMessage;
    }
    case 'connection_request': {
      const headline = `${SAMPLE.actorFirstName} wants to connect`;
      const parts = SMSMessageFormatter.formatShortMessage(
        headline,
        'View profile to accept',
        'View',
        `${TEST_BASE_URL}/dashboard/notifications`,
        { complianceLevel: 'short' }
      );
      return parts.fullMessage;
    }
    case 'connection_accepted': {
      const headline = `${SAMPLE.actorFirstName} accepted your request`;
      const parts = SMSMessageFormatter.formatShortMessage(
        headline,
        'Say hello',
        'Open',
        `${TEST_BASE_URL}/dashboard/notifications`,
        { complianceLevel: 'short' }
      );
      return parts.fullMessage;
    }
    case 'new_message': {
      const headline = `New message from ${SAMPLE.actorFirstName}`;
      const parts = SMSMessageFormatter.formatShortMessage(
        headline,
        'Tap to reply',
        'Open',
        `${TEST_BASE_URL}/dashboard/messages`,
        { complianceLevel: 'short' }
      );
      return parts.fullMessage;
    }
    case 'post_comment': {
      const headline = `${SAMPLE.actorFirstName} commented on your post`;
      const detail = SAMPLE.content.slice(0, 50).replace(/\s+/g, ' ').trim();
      const parts = SMSMessageFormatter.formatShortMessage(
        headline,
        detail,
        'View',
        `${TEST_BASE_URL}/dashboard/post/${TEST_POST_ID}`,
        { complianceLevel: 'short' }
      );
      return parts.fullMessage;
    }
    case 'comment_reply': {
      const headline = `${SAMPLE.actorFirstName} replied to your comment`;
      const parts = SMSMessageFormatter.formatShortMessage(
        headline,
        'View post',
        'View',
        `${TEST_BASE_URL}/dashboard/post/${TEST_POST_ID}`,
        { complianceLevel: 'short' }
      );
      return parts.fullMessage;
    }
    case 'post_like': {
      const headline = `${SAMPLE.actorFirstName} liked your post`;
      const parts = SMSMessageFormatter.formatShortMessage(
        headline,
        'View post',
        'View',
        `${TEST_BASE_URL}/dashboard/post/${TEST_POST_ID}`,
        { complianceLevel: 'short' }
      );
      return parts.fullMessage;
    }
    case 'comment_like': {
      const headline = `${SAMPLE.actorFirstName} liked your comment`;
      const parts = SMSMessageFormatter.formatShortMessage(
        headline,
        'View post',
        'View',
        `${TEST_BASE_URL}/dashboard/post/${TEST_POST_ID}`,
        { complianceLevel: 'short' }
      );
      return parts.fullMessage;
    }
    case 'inactivity_reminder': {
      const headline = 'We miss you on Trailblaize';
      const parts = SMSMessageFormatter.formatShortMessage(
        headline,
        "Your chapter is here when you're ready.",
        'Open',
        `${TEST_BASE_URL}/dashboard`,
        { complianceLevel: 'short' }
      );
      return parts.fullMessage;
    }
    default:
      return '(no SMS for this type)';
  }
}

function buildEmailPayloadForType(type: NotificationType): DryRunResult['email'] {
  switch (type) {
    case 'chapter_announcement':
      return {
        subject: `Chapter Announcement: ${SAMPLE.title}`,
        templateData: {
          payload: {
            title: SAMPLE.title,
            summary: SAMPLE.summary,
            announcement_id: TEST_CONNECTION_ID,
            has_primary_link: false,
            primary_link_url: '',
            primary_link_label: '',
            in_app_announcements_url: 'https://www.trailblaize.net/dashboard/announcements',
          },
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          chapter: { name: SAMPLE.chapterName },
          cta: {
            label: 'Read Full Announcement',
            url: 'https://www.trailblaize.net/dashboard/announcements',
          },
        },
      };
    case 'new_event':
      return {
        subject: `New Event: ${SAMPLE.eventTitle}`,
        templateData: {
          payload: {
            event: {
              title: SAMPLE.eventTitle,
              description: SAMPLE.eventDescription,
              location: SAMPLE.eventLocation,
              start_at_human: SAMPLE.eventDate,
              end_at_human: 'Sat, Mar 15, 2025, 12:00 AM',
              event_id: 'test-event-id',
            },
          },
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          chapter: { name: SAMPLE.chapterName },
          cta: { label: 'View Event', url: 'https://www.trailblaize.net/event/test' },
        },
      };
    case 'event_reminder':
      return {
        subject: `Event Reminder: ${SAMPLE.eventTitle}`,
        templateData: {
          recipient: { first_name: SAMPLE.firstName },
          chapter: { name: SAMPLE.chapterName },
          payload: {
            event: {
              title: SAMPLE.eventTitle,
              description: SAMPLE.eventDescription,
              location: SAMPLE.eventLocation,
              start_at_human: SAMPLE.eventDate,
              start_at_relative: 'in 2 days',
            },
          },
          cta: { url: 'https://www.trailblaize.net' },
        },
      };
    case 'connection_request': {
      const actorFullName = SAMPLE.actorLastName?.trim()
        ? `${SAMPLE.actorFirstName} ${SAMPLE.actorLastName.trim()}`
        : SAMPLE.actorFirstName;
      return {
        subject: `${actorFullName} wants to connect with you on Trailblaize`,
        templateData: {
          payload: { message: SAMPLE.connectionMessage },
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          actor: {
            first_name: SAMPLE.actorFirstName,
            last_name: SAMPLE.actorLastName ?? '',
            avatar_url: SAMPLE.actorAvatarUrl ?? '',
          },
          chapter: { name: SAMPLE.chapterName },
          cta: { label: 'View Request', url: 'https://www.trailblaize.net/dashboard/notifications' },
        },
      };
    }
    case 'connection_accepted':
      return {
        subject: `${SAMPLE.actorFirstName} accepted your connection request on Trailblaize`,
        templateData: {
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          actor: { first_name: SAMPLE.actorFirstName },
          chapter: { name: SAMPLE.chapterName },
          cta: { label: 'View Connection', url: 'https://www.trailblaize.net/dashboard/notifications' },
        },
      };
    case 'new_message':
      return {
        subject: `New message from ${SAMPLE.actorFirstName} on Trailblaize`,
        templateData: {
          payload: { preview: SAMPLE.messagePreview },
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          actor: { first_name: SAMPLE.actorFirstName },
          chapter: { name: SAMPLE.chapterName },
          cta: { label: 'Open Chat', url: 'https://www.trailblaize.net/dashboard/messages' },
        },
      };
    case 'password_reset_template':
      return {
        subject: 'Reset Your GreekSpeed Password',
        templateData: {
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          chapter: { name: SAMPLE.chapterName },
          reset_link: SAMPLE.resetLink,
          timestamp: SAMPLE.timestamp,
        },
      };
    case 'password_change':
      return {
        subject: 'Password Successfully Changed - GreekSpeed',
        templateData: {
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          chapter: { name: SAMPLE.chapterName },
          timestamp: SAMPLE.timestamp,
          device_info: 'Test Device',
          dashboard_link: 'https://www.trailblaize.net/dashboard',
        },
      };
    case 'welcome':
      return {
        subject: `Welcome to GreekSpeed, ${SAMPLE.userName}!`,
        bodyDescription: `Inline HTML: header "Welcome to GreekSpeed!", body with userName=${SAMPLE.userName}, chapterName=${SAMPLE.chapterName}, feature list, "Get Started" button.`,
      };
    case 'generic_notification':
      return {
        subject: `GreekSpeed: ${SAMPLE.title}`,
        bodyDescription: `Inline HTML: title=${SAMPLE.title}, userName=${SAMPLE.userName}, message="Sample notification message."`,
      };
    case 'post_comment':
      return {
        subject: `${SAMPLE.actorFirstName} commented on your post on Trailblaize`,
        templateData: {
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          title: 'New comment on your post',
          body: `${SAMPLE.actorFirstName} commented: "${SAMPLE.content.slice(0, 80)}..."`,
          cta: { label: 'View post', url: `${TEST_BASE_URL}/dashboard/post/${TEST_POST_ID}` },
        },
      };
    case 'comment_reply':
      return {
        subject: `${SAMPLE.actorFirstName} replied to your comment on Trailblaize`,
        templateData: {
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          title: 'New reply to your comment',
          body: `${SAMPLE.actorFirstName} replied: "${SAMPLE.content.slice(0, 80)}..."`,
          cta: { label: 'View post', url: `${TEST_BASE_URL}/dashboard/post/${TEST_POST_ID}` },
        },
      };
    case 'post_like':
      return {
        subject: `${SAMPLE.actorFirstName} liked your post on Trailblaize`,
        templateData: {
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          title: 'Your post was liked',
          body: `${SAMPLE.actorFirstName} liked your post.`,
          cta: { label: 'View post', url: `${TEST_BASE_URL}/dashboard/post/${TEST_POST_ID}` },
        },
      };
    case 'comment_like':
      return {
        subject: `${SAMPLE.actorFirstName} liked your comment on Trailblaize`,
        templateData: {
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          title: 'Your comment was liked',
          body: `${SAMPLE.actorFirstName} liked your comment.`,
          cta: { label: 'View post', url: `${TEST_BASE_URL}/dashboard/post/${TEST_POST_ID}` },
        },
      };
    case 'inactivity_reminder':
      return {
        subject: "We haven't seen you in a while on Trailblaize",
        templateData: {
          recipient: { first_name: SAMPLE.firstName, email: 'test@example.com' },
          title: 'We miss you',
          body: `It's been a while since you've been on Trailblaize. Your ${SAMPLE.chapterName} community is here when you're ready to catch up.`,
          cta: { label: 'Open Trailblaize', url: `${TEST_BASE_URL}/dashboard` },
        },
      };
    default:
      return { subject: '(unknown)', bodyDescription: '(no email)' };
  }
}

function hasEmail(type: NotificationType): boolean {
  if (type === 'membership_request_admin') return false;
  return true;
}

function hasSms(type: NotificationType): boolean {
  return SMS_EVENT_TYPES.includes(type);
}

export async function runNotificationTest(options: NotificationTestOptions): Promise<DryRunResult | SendResult> {
  const { type, toEmail, toPhone, sendEmail, sendSms, dryRun } = options;

  if (dryRun) {
    const result: DryRunResult = { type };
    if (sendEmail && hasEmail(type)) {
      result.email = buildEmailPayloadForType(type);
    }
    if (sendSms && hasSms(type)) {
      result.sms = { body: buildSmsBodyForType(type) };
    }
    return result;
  }

  const result: SendResult = { type };

  if (sendEmail && hasEmail(type)) {
    try {
      let emailSent = false;
      switch (type) {
        case 'chapter_announcement':
          emailSent = await EmailService.sendChapterAnnouncement({
            to: toEmail,
            firstName: SAMPLE.firstName,
            chapterName: SAMPLE.chapterName,
            title: SAMPLE.title,
            summary: SAMPLE.summary,
            content: SAMPLE.content,
            announcementId: TEST_CONNECTION_ID,
            announcementType: 'general',
          });
          break;
        case 'new_event':
          emailSent = await EmailService.sendEventNotification({
            to: toEmail,
            firstName: SAMPLE.firstName,
            chapterName: SAMPLE.chapterName,
            eventTitle: SAMPLE.eventTitle,
            eventDescription: SAMPLE.eventDescription,
            eventLocation: SAMPLE.eventLocation,
            eventStartTime: SAMPLE.eventStartTime,
            eventEndTime: SAMPLE.eventEndTime,
            eventId: 'test-event-id',
          });
          break;
        case 'event_reminder':
          emailSent = await EmailService.sendEventReminder({
            to: toEmail,
            firstName: SAMPLE.firstName,
            chapterName: SAMPLE.chapterName,
            eventTitle: SAMPLE.eventTitle,
            eventDescription: SAMPLE.eventDescription,
            eventLocation: SAMPLE.eventLocation,
            eventStartTime: SAMPLE.eventStartTime,
            eventEndTime: SAMPLE.eventEndTime,
            eventId: 'test-event-id',
            startAtRelative: 'in 2 days',
          });
          break;
        case 'connection_request':
          emailSent = await EmailService.sendConnectionRequestNotification({
            to: toEmail,
            firstName: SAMPLE.firstName,
            chapterName: SAMPLE.chapterName,
            actorFirstName: SAMPLE.actorFirstName,
            actorLastName: SAMPLE.actorLastName,
            actorAvatarUrl: SAMPLE.actorAvatarUrl,
            message: SAMPLE.connectionMessage,
            connectionId: TEST_CONNECTION_ID,
          });
          break;
        case 'connection_accepted':
          emailSent = await EmailService.sendConnectionAcceptedNotification({
            to: toEmail,
            firstName: SAMPLE.firstName,
            chapterName: SAMPLE.chapterName,
            actorFirstName: SAMPLE.actorFirstName,
            connectionId: TEST_CONNECTION_ID,
          });
          break;
        case 'new_message':
          emailSent = await EmailService.sendMessageNotification({
            to: toEmail,
            firstName: SAMPLE.firstName,
            chapterName: SAMPLE.chapterName,
            actorFirstName: SAMPLE.actorFirstName,
            messagePreview: SAMPLE.messagePreview,
            connectionId: TEST_CONNECTION_ID,
          });
          break;
        case 'password_reset_template':
          emailSent = await EmailService.sendPasswordResetInstructions({
            to: toEmail,
            firstName: SAMPLE.firstName,
            chapterName: SAMPLE.chapterName,
            resetLink: SAMPLE.resetLink,
            timestamp: SAMPLE.timestamp,
          });
          break;
        case 'password_change':
          emailSent = await EmailService.sendPasswordChangeConfirmation({
            to: toEmail,
            firstName: SAMPLE.firstName,
            chapterName: SAMPLE.chapterName,
            timestamp: SAMPLE.timestamp,
            deviceInfo: 'Test Device',
          });
          break;
        case 'welcome':
          emailSent = await EmailService.sendWelcomeEmail({
            to: toEmail,
            userName: SAMPLE.userName,
            chapterName: SAMPLE.chapterName,
          });
          break;
        case 'generic_notification':
          emailSent = await EmailService.sendNotificationEmail({
            to: toEmail,
            userName: SAMPLE.userName,
            title: SAMPLE.title,
            message: 'Sample notification message.',
            actionUrl: 'https://www.trailblaize.net/dashboard',
            actionText: 'Open Dashboard',
          });
          break;
        case 'post_comment':
          emailSent = await EmailService.sendPostCommentNotification({
            to: toEmail,
            firstName: SAMPLE.firstName,
            chapterName: SAMPLE.chapterName,
            actorFirstName: SAMPLE.actorFirstName,
            contentPreview: SAMPLE.content.slice(0, 80),
            postId: TEST_POST_ID,
          });
          break;
        case 'comment_reply':
          emailSent = await EmailService.sendCommentReplyNotification({
            to: toEmail,
            firstName: SAMPLE.firstName,
            chapterName: SAMPLE.chapterName,
            actorFirstName: SAMPLE.actorFirstName,
            contentPreview: SAMPLE.content.slice(0, 80),
            postId: TEST_POST_ID,
          });
          break;
        case 'post_like':
          emailSent = await EmailService.sendPostLikeNotification({
            to: toEmail,
            firstName: SAMPLE.firstName,
            actorFirstName: SAMPLE.actorFirstName,
            postId: TEST_POST_ID,
          });
          break;
        case 'comment_like':
          emailSent = await EmailService.sendCommentLikeNotification({
            to: toEmail,
            firstName: SAMPLE.firstName,
            actorFirstName: SAMPLE.actorFirstName,
            postId: TEST_POST_ID,
          });
          break;
        case 'inactivity_reminder':
          emailSent = await EmailService.sendInactivityReminderEmail({
            to: toEmail,
            firstName: SAMPLE.firstName,
            chapterName: SAMPLE.chapterName,
          });
          break;
      }
      result.emailSent = emailSent;
    } catch (err) {
      result.emailError = err instanceof Error ? err.message : String(err);
    }
  }

  if (sendSms && hasSms(type)) {
    const formattedPhone = SMSService.formatPhoneNumber(toPhone);
    if (!SMSService.isValidPhoneNumber(toPhone)) {
      result.smsError = 'Invalid phone number format';
    } else {
      try {
        let smsSent = false;
        switch (type) {
          case 'chapter_announcement': {
            const headline = SAMPLE.title.slice(0, 40);
            const detail = SAMPLE.content.slice(0, 60).replace(/\s+/g, ' ').trim();
            const parts = SMSMessageFormatter.formatShortMessage(
              headline,
              detail,
              'Read more',
              `${TEST_BASE_URL}/dashboard/announcements`,
              { complianceLevel: 'full' }
            );
            const sendResult = await SMSService.sendSMS({ to: formattedPhone, body: parts.fullMessage });
            smsSent = sendResult.success;
            break;
          }
          case 'new_event':
            smsSent = await SMSNotificationService.sendEventNotification(
              formattedPhone,
              SAMPLE.firstName,
              SAMPLE.eventTitle,
              SAMPLE.eventDate,
              TEST_USER_ID,
              TEST_CHAPTER_ID
            );
            break;
          case 'connection_request':
            smsSent = await SMSNotificationService.sendConnectionRequestNotification(
              formattedPhone,
              SAMPLE.firstName,
              SAMPLE.actorFirstName,
              TEST_USER_ID,
              TEST_CHAPTER_ID
            );
            break;
          case 'connection_accepted':
            smsSent = await SMSNotificationService.sendConnectionAcceptedNotification(
              formattedPhone,
              SAMPLE.firstName,
              SAMPLE.actorFirstName,
              TEST_USER_ID,
              TEST_CHAPTER_ID
            );
            break;
          case 'new_message':
            smsSent = await SMSNotificationService.sendMessageNotification(
              formattedPhone,
              SAMPLE.firstName,
              SAMPLE.actorFirstName,
              SAMPLE.messagePreview,
              TEST_USER_ID,
              TEST_CHAPTER_ID
            );
            break;
          case 'post_comment':
            smsSent = await SMSNotificationService.sendPostCommentNotification(
              formattedPhone,
              SAMPLE.firstName,
              SAMPLE.actorFirstName,
              SAMPLE.content.slice(0, 80),
              TEST_USER_ID,
              TEST_CHAPTER_ID,
              { postId: TEST_POST_ID }
            );
            break;
          case 'comment_reply':
            smsSent = await SMSNotificationService.sendCommentReplyNotification(
              formattedPhone,
              SAMPLE.firstName,
              SAMPLE.actorFirstName,
              SAMPLE.content.slice(0, 80),
              TEST_USER_ID,
              TEST_CHAPTER_ID,
              { postId: TEST_POST_ID }
            );
            break;
          case 'post_like':
            smsSent = await SMSNotificationService.sendPostLikeNotification(
              formattedPhone,
              SAMPLE.firstName,
              SAMPLE.actorFirstName,
              TEST_USER_ID,
              TEST_CHAPTER_ID,
              { postId: TEST_POST_ID }
            );
            break;
          case 'comment_like':
            smsSent = await SMSNotificationService.sendCommentLikeNotification(
              formattedPhone,
              SAMPLE.firstName,
              SAMPLE.actorFirstName,
              TEST_USER_ID,
              TEST_CHAPTER_ID,
              { postId: TEST_POST_ID }
            );
            break;
          case 'inactivity_reminder':
            smsSent = await SMSNotificationService.sendInactivityReminderNotification(
              formattedPhone,
              SAMPLE.firstName,
              TEST_USER_ID,
              TEST_CHAPTER_ID
            );
            break;
        }
        result.smsSent = smsSent;
      } catch (err) {
        result.smsError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return result;
}
