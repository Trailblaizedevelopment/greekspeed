export interface Announcement {
  id: string;
  chapter_id: string;
  sender_id: string;
  title: string;
  content: string;
  announcement_type: 'general' | 'urgent' | 'event' | 'academic';
  is_scheduled: boolean;
  scheduled_at?: string;
  is_sent: boolean;
  sent_at?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
  recipients_count?: number;
  read_count?: number;
  is_read?: boolean;
  read_at?: string;
}

export interface AnnouncementRecipient {
  id: string;
  announcement_id: string;
  recipient_id: string;
  is_read: boolean;
  read_at?: string;
  notification_sent: boolean;
  notification_sent_at?: string;
  created_at: string;
  recipient?: {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
}

export interface NotificationSettings {
  id: string;
  user_id: string;
  chapter_id: string;
  sms_enabled: boolean;
  sms_phone?: string;
  email_enabled: boolean;
  push_enabled: boolean;
  announcement_notifications: boolean;
  event_notifications: boolean;
  urgent_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnouncementData {
  title: string;
  content: string;
  announcement_type: 'general' | 'urgent' | 'event' | 'academic';
  is_scheduled?: boolean;
  scheduled_at?: string;

  /**
   * Whether to send an SMS notification to active members/admins.
   * This preserves existing behavior.
   */
  send_sms?: boolean;
  /**
   * Whether to send an SMS notification to alumni.
   * Used when execs choose the "Send SMS to alumni" option.
   */
  send_sms_to_alumni?: boolean;

  /** Send an email notification to active members/admins. */
  send_email_to_members?: boolean;

  /** Send an email notification to active members/admins */
  send_email_to_alumni?: boolean;

  metadata?: Record<string, any>;
}

/**
 * Multi-chapter broadcast request for governance users.
 * Extends the single-chapter CreateAnnouncementData with an array of target chapter IDs.
 */
export interface MultiChapterAnnouncementData extends CreateAnnouncementData {
  /** Target chapter IDs for the broadcast. Must be a subset of the caller's managed chapters. */
  chapter_ids: string[];
}

/** Per-chapter recipient counts returned by the preview endpoint. */
export interface ChapterRecipientCounts {
  chapter_id: string;
  chapter_name: string;
  sms_recipients: number;
  alumni_sms_recipients: number;
  email_recipients: number;
  alumni_email_recipients: number;
  total_members: number;
  total_alumni: number;
}

/** Request body for the multi-chapter recipient preview endpoint. */
export interface RecipientPreviewRequest {
  chapter_ids: string[];
  send_sms?: boolean;
  send_sms_to_alumni?: boolean;
  send_email_to_members?: boolean;
  send_email_to_alumni?: boolean;
}

/** Response from the multi-chapter recipient preview endpoint. */
export interface RecipientPreviewResponse {
  chapters: ChapterRecipientCounts[];
  totals: {
    sms_recipients: number;
    alumni_sms_recipients: number;
    email_recipients: number;
    alumni_email_recipients: number;
    total_members: number;
    total_alumni: number;
  };
}

/** One image in announcements.metadata.images (v1: max one in API validation later) */
export interface AnnouncementImageMetadataEntry {
  url: string;
  alt?: string;
  mimeType: string;
  sizeBytes: number;
}