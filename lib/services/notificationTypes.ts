/**
 * Shared notification type definitions and event lists that are safe to import
 * from both client and server code. This module MUST NOT import any Node-only
 * libraries (like SendGrid) so it can be bundled for the browser.
 */

export const NOTIFICATION_TYPES = [
  'chapter_announcement',
  'new_event',
  'event_reminder',
  'connection_request',
  'connection_accepted',
  'new_message',
  'password_reset_template',
  'password_change',
  'welcome',
  'generic_notification',
  'post_comment',
  'comment_reply',
  'post_like',
  'comment_like',
  'inactivity_reminder',
  'system_alert',
  // TRA-593: OneSignal push to chapter reviewers on new membership request
  'membership_request_admin',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Event types that support sending test email. */
export const EMAIL_EVENT_TYPES: readonly NotificationType[] = [
  'chapter_announcement',
  'new_event',
  'event_reminder',
  'connection_request',
  'connection_accepted',
  'new_message',
  'password_reset_template',
  'password_change',
  'welcome',
  'generic_notification',
  'post_comment',
  'comment_reply',
  'post_like',
  'comment_like',
  'inactivity_reminder',
];

/** Event types that support SMS notifications. */
export const SMS_EVENT_TYPES: readonly NotificationType[] = [
  'chapter_announcement',
  'new_event',
  'connection_request',
  'connection_accepted',
  'new_message',
  'post_comment',
  'comment_reply',
  'post_like',
  'comment_like',
  'inactivity_reminder',
];

