/**
 * Maps notification events to OneSignal push payloads (title, body, url, icon).
 * Single source for push content and deep links so every channel uses the same structure.
 */

import type { NotificationType } from '@/lib/services/notificationTypes';
import type { OneSignalPushPayload } from '@/lib/services/oneSignalPushService';
import { getEmailBaseUrl } from '@/lib/utils/urlUtils';

/** Context fields used to build push payloads. Not all fields are required for every event. */
export interface NotificationPushContext {
  baseUrl?: string;

  announcementId?: string;
  announcementTitle?: string;

  eventId?: string;
  eventSlug?: string | null;
  eventTitle?: string;
  eventStartAt?: string;
  startAtRelative?: string;

  connectionId?: string;

  actorFirstName?: string;
  actorFullName?: string;
  chapterName?: string;

  messagePreview?: string;

  postId?: string;
  commentId?: string;
  contentPreview?: string;

  /** Pending membership request (admin / governance reviewer push) */
  membershipRequestId?: string;
  /** Applicant display name for membership_request_admin */
  membershipApplicantName?: string;

  /** For system_alert / generic_notification */
  title?: string;
  body?: string;
}

/** Sample context for testing push notifications. Merges defaults with optional overrides. */
const SAMPLE_PUSH_CONTEXT: NotificationPushContext = {
  announcementTitle: 'Spring Formal 2025',
  eventId: 'test-event-id',
  eventSlug: 'chapter-formal',
  eventTitle: 'Chapter Formal',
  startAtRelative: 'in 2 days',
  connectionId: 'test-connection-id-123',
  actorFirstName: 'Alex',
  chapterName: 'Alpha Beta Gamma',
  messagePreview: 'Hey, are you going to the formal?',
  postId: 'test-post-id',
  commentId: 'test-comment-id',
  contentPreview: 'Great event!',
  membershipRequestId: '00000000-0000-4000-8000-000000000001',
  membershipApplicantName: 'Jordan Lee',
  title: 'Test notification',
  body: 'This is a test push from the developer portal.',
};

/**
 * Returns sample context for building a test push payload. Used by developer test-push API.
 * Overrides (e.g. title, body for system_alert) are merged on top of defaults.
 */
export function getSamplePushContext(
  _event: NotificationType,
  overrides?: Partial<NotificationPushContext>
): NotificationPushContext {
  return { ...SAMPLE_PUSH_CONTEXT, ...overrides };
}

/** Event types that support push notifications. Used by test UI and API. */
export const PUSH_EVENT_TYPES: readonly NotificationType[] = [
  'chapter_announcement',
  'new_event',
  'event_reminder',
  'connection_request',
  'connection_accepted',
  'new_message',
  'post_comment',
  'comment_reply',
  'post_like',
  'comment_like',
  'system_alert',
  'welcome',
  'generic_notification',
  'membership_request_admin',
];

/**
 * Returns whether the given event type supports push (has a payload mapping).
 */
export function supportsPush(event: NotificationType): boolean {
  return PUSH_EVENT_TYPES.includes(event as (typeof PUSH_EVENT_TYPES)[number]);
}

/**
 * Builds the OneSignal push payload for a notification event and context.
 * Uses app base URL for deep links (same as email CTAs).
 */
export function buildPushPayload(
  event: NotificationType,
  context: NotificationPushContext
): OneSignalPushPayload {
  const base = context.baseUrl ?? getEmailBaseUrl();

  switch (event) {
    case 'chapter_announcement':
      return {
        title: 'Chapter Announcement',
        body: context.announcementTitle ?? 'New announcement from your chapter',
        url: `${base}/dashboard/announcements`,
      };

    case 'new_event':
      return {
        title: 'New Event',
        body: context.eventTitle
          ? `${context.eventTitle} – check it out`
          : 'A new chapter event was created',
        url:
          context.eventId && (context.eventSlug || context.eventId)
            ? `${base}/event/${context.eventSlug ?? context.eventId}`
            : `${base}/dashboard`,
      };

    case 'event_reminder':
      return {
        title: 'Event Reminder',
        body: context.eventTitle
          ? context.startAtRelative
            ? `${context.eventTitle} – ${context.startAtRelative}`
            : context.eventTitle
          : 'An event is coming up',
        url:
          context.eventId && (context.eventSlug || context.eventId)
            ? `${base}/event/${context.eventSlug ?? context.eventId}`
            : `${base}/dashboard`,
      };

    case 'connection_request':
      return {
        title: 'New Connection Request',
        body: context.actorFirstName
          ? `${context.actorFirstName} wants to connect with you`
          : 'Someone wants to connect with you',
        url: context.connectionId
          ? `${base}/dashboard/notifications?connection=${context.connectionId}`
          : `${base}/dashboard/notifications`,
      };

    case 'membership_request_admin':
      return {
        title: 'New membership request',
        body:
          context.membershipApplicantName || context.actorFullName
            ? `${context.membershipApplicantName ?? context.actorFullName} requested to join ${context.chapterName ?? 'your chapter'}`
            : `Someone requested to join ${context.chapterName ?? 'your chapter'}`,
        url: context.membershipRequestId
          ? `${base}/dashboard/requests?request=${encodeURIComponent(context.membershipRequestId)}`
          : `${base}/dashboard/requests`,
      };

    case 'connection_accepted':
      return {
        title: 'Connection Accepted',
        body: context.actorFirstName
          ? `${context.actorFirstName} accepted your connection request`
          : 'Your connection request was accepted',
        url: context.connectionId
          ? `${base}/dashboard/notifications?connection=${context.connectionId}`
          : `${base}/dashboard/notifications`,
      };

    case 'new_message':
      return {
        title: 'New Message',
        body: context.actorFirstName
          ? context.messagePreview
            ? `${context.actorFirstName}: ${context.messagePreview}`
            : `${context.actorFirstName} sent you a message`
          : 'You have a new message',
        url: context.connectionId
          ? `${base}/dashboard/messages?connection=${context.connectionId}`
          : `${base}/dashboard/messages`,
      };

    case 'post_comment':
      return {
        title: 'New Comment',
        body: context.actorFirstName
          ? context.contentPreview
            ? `${context.actorFirstName} commented: ${context.contentPreview}`
            : `${context.actorFirstName} commented on a post`
          : 'Someone commented on a post',
        url: context.postId
          ? `${base}/dashboard/post/${context.postId}`
          : `${base}/dashboard`,
      };

    case 'comment_reply':
      return {
        title: 'New Reply',
        body: context.actorFirstName
          ? context.contentPreview
            ? `${context.actorFirstName} replied: ${context.contentPreview}`
            : `${context.actorFirstName} replied to your comment`
          : 'Someone replied to your comment',
        url: context.postId
          ? `${base}/dashboard/post/${context.postId}`
          : `${base}/dashboard`,
      };

    case 'post_like':
      return {
        title: 'Post liked',
        body: context.actorFirstName
          ? `${context.actorFirstName} liked your post`
          : 'Someone liked your post',
        url: context.postId
          ? `${base}/dashboard/post/${context.postId}`
          : `${base}/dashboard`,
      };

    case 'comment_like':
      return {
        title: 'Comment liked',
        body: context.actorFirstName
          ? `${context.actorFirstName} liked your comment`
          : 'Someone liked your comment',
        url: context.postId
          ? `${base}/dashboard/post/${context.postId}`
          : `${base}/dashboard`,
      };

    case 'system_alert':
      return {
        title: context.title ?? 'Trailblaize',
        body: context.body ?? 'You have a new notification',
        url: `${base}/dashboard/notifications`,
      };

    case 'welcome':
      return {
        title: 'Welcome',
        body: context.actorFirstName
          ? `Welcome to Trailblaize, ${context.actorFirstName}`
          : 'Welcome to Trailblaize',
        url: `${base}/dashboard`,
      };

    case 'generic_notification':
      return {
        title: context.title ?? 'Trailblaize',
        body: context.body ?? 'You have a new notification',
        url: `${base}/dashboard`,
      };

    default:
      return {
        title: 'Trailblaize',
        body: 'You have a new notification',
        url: `${base}/dashboard/notifications`,
      };
  }
}
