import sgMail from '@sendgrid/mail';
import { getEmailBaseUrl } from '@/lib/utils/urlUtils';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { getPrimaryLinkFromMetadata } from '@/lib/validation/announcementMetadata';

function escapeHtmlForEmail(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export interface EmailTemplate {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface PasswordResetEmail {
  to: string;
  resetLink: string;
  userName: string;
}

export interface WelcomeEmail {
  to: string;
  userName: string;
  chapterName: string;
}

export interface NotificationEmail {
  to: string;
  userName: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}

export interface ChapterAnnouncementEmail {
  to: string;
  firstName: string;
  chapterName: string;
  title: string;
  summary?: string;
  content: string;
  announcementId: string;
  announcementType: 'general' | 'urgent' | 'event' | 'academic';
  /** Public HTTPS URL for optional announcement image (SendGrid template: conditional block) */
  imageUrl?: string | null;
  imageAlt?: string | null;
  /** Announcement row `metadata` JSON — used for optional `primary_link` in SendGrid dynamic template */
  metadata?: unknown | null;
}

// NEW: Event notification interface
export interface EventNotificationEmail {
  to: string;
  firstName: string;
  chapterName: string;
  eventTitle: string;
  eventDescription?: string;
  eventLocation?: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  eventId: string;
}

// NEW: Connection request notification interface
export interface ConnectionRequestEmail {
  to: string;
  firstName: string;
  chapterName: string;
  actorFirstName: string;
  actorLastName?: string;
  actorAvatarUrl?: string | null;
  message?: string;
  connectionId: string;
}

// NEW: Connection accepted notification interface
export interface ConnectionAcceptedEmail {
  to: string;
  firstName: string;
  chapterName: string;
  actorFirstName: string;
  connectionId: string;
}

// NEW: Message notification interface
export interface MessageNotificationEmail {
  to: string;
  firstName: string;
  chapterName: string;
  actorFirstName: string;
  messagePreview: string;
  connectionId: string;
}

// Add these interfaces after line 85 (after MessageNotificationEmail interface)
export interface PasswordChangeConfirmationEmail {
  to: string;
  firstName: string;
  chapterName: string;
  timestamp: string;
  deviceInfo?: string;
}

export interface PasswordResetInstructionsEmail {
  to: string;
  firstName: string;
  chapterName: string;
  resetLink: string;
  timestamp: string;
}

/** Payload for generic notification template (post comment, comment reply, post like, comment like, inactivity) */
export interface GenericNotificationTemplateData {
  to: string;
  subject: string;
  firstName: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  templateId?: string;
}

export class EmailService {
  private static fromEmail = process.env.SENDGRID_FROM_EMAIL || 'devin@trailblaize.net';
  private static fromName = process.env.SENDGRID_FROM_NAME || 'GreekSpeed';

  /**
   * Send a chapter announcement email using dynamic template
   */
  static async sendChapterAnnouncement({
    to,
    firstName,
    chapterName,
    title,
    summary,
    content,
    announcementId,
    announcementType,
    imageUrl,
    imageAlt,
    metadata,
  }: ChapterAnnouncementEmail): Promise<boolean> {
    try {
      const baseUrl = getEmailBaseUrl().replace(/\/$/, '');
      const hasImage = Boolean(imageUrl && imageUrl.length > 0);
      const inAppAnnouncementsUrl = `${baseUrl}/dashboard/announcements`;

      const primaryLink = getPrimaryLinkFromMetadata(metadata);
      const hasPrimaryLink = Boolean(primaryLink);
      const primaryLinkUrl = primaryLink?.url ?? '';
      const primaryLinkLabel = primaryLink?.label?.trim() ?? '';

      const ctaUrl = primaryLink?.url ?? inAppAnnouncementsUrl;
      const ctaLabel = primaryLink?.url
        ? primaryLinkLabel || 'Open link'
        : 'Read Full Announcement';

      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `Chapter Announcement: ${title}`,
        templateId: process.env.SENDGRID_ANNOUNCEMENT_TEMPLATE_ID!, // Use your new dynamic template ID
        dynamicTemplateData: {
          payload: {
            title: title,
            summary: summary || content.substring(0, 200) + (content.length > 200 ? '...' : ''), // Use content as summary if no summary provided
            announcement_id: announcementId,
            announcement_type: announcementType,
            content: content,
            has_image: hasImage,
            image_url: hasImage ? imageUrl : '',
            image_alt: imageAlt && imageAlt.trim() ? imageAlt.trim() : '',
            has_primary_link: hasPrimaryLink,
            primary_link_url: primaryLinkUrl,
            primary_link_label: primaryLinkLabel,
            /** In-app list URL for optional secondary CTA in SendGrid when `has_primary_link` is true */
            in_app_announcements_url: inAppAnnouncementsUrl,
          },
          recipient: {
            first_name: firstName,
            email: to
          },
          chapter: {
            name: chapterName
          },
          cta: {
            label: ctaLabel,
            url: ctaUrl,
          },
          unsubscribe: `{{unsubscribe}}`,
          unsubscribe_preferences: `{{unsubscribe_preferences}}`
        }
      };

      await sgMail.send(msg);
      // Chapter announcement email sent successfully
      return true;
    } catch (error) {
      console.error('❌ Failed to send chapter announcement email:', error);
      // Add detailed error logging
      if (error && typeof error === 'object' && 'response' in error) {
        const sgError = error as any;
        console.error('SendGrid Response Body:', JSON.stringify(sgError.response?.body, null, 2));
        console.error('SendGrid Response Headers:', sgError.response?.headers);
      }
      console.error('Error details:', {
        to,
        templateId: process.env.SENDGRID_ANNOUNCEMENT_TEMPLATE_ID,
        fromEmail: this.fromEmail,
        hasApiKey: !!process.env.SENDGRID_API_KEY
      });
      return false;
    }
  }

  /**
   * Send announcement to multiple recipients
   */
  static async sendAnnouncementToChapter(
    recipients: Array<{
      email: string;
      firstName: string;
      chapterName: string;
    }>,
    announcementData: {
      title: string;
      summary?: string;
      content: string;
      announcementId: string;
      announcementType: 'general' | 'urgent' | 'event' | 'academic';
      imageUrl?: string | null;
      imageAlt?: string | null;
      metadata?: unknown | null;
      // priority: 'low' | 'normal' | 'high' | 'urgent';
    }
  ): Promise<{ successful: number; failed: number }> {
    const results = await Promise.allSettled(
      recipients.map(recipient => 
        this.sendChapterAnnouncement({
          to: recipient.email,
          firstName: recipient.firstName,
          chapterName: recipient.chapterName,
          ...announcementData
        })
      )
    );

    const successful = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.length - successful;

    return { successful, failed };
  }

  /**
   * NEW: Send an event notification email using dynamic template
   */
  static async sendEventNotification({
    to,
    firstName,
    chapterName,
    eventTitle,
    eventDescription,
    eventLocation,
    eventStartTime,
    eventEndTime,
    eventId
  }: EventNotificationEmail): Promise<boolean> {
    try {
      // Generate magic link with event context
      // First, try to get event slug if available, otherwise use eventId
      const supabase = createServerSupabaseClient();
      const { data: eventData } = await supabase
        .from('events')
        .select('slug')
        .eq('id', eventId)
        .single();
  
      const eventPath = eventData?.slug 
        ? `/event/${eventData.slug}` 
        : `/event/${eventId}`;
  
      const notificationUrl = await this.generateMagicLink(
        to,
        eventPath
      );
  
      const formatDateTime = (date: Date) => {
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        });
      };

      const startHuman = eventStartTime ? formatDateTime(new Date(eventStartTime)) : 'Time TBD';
      const endHuman = eventEndTime ? formatDateTime(new Date(eventEndTime)) : 'Time TBD';

      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `New Event: ${eventTitle}`,
        templateId: process.env.SENDGRID_EVENT_TEMPLATE_ID!,
        dynamicTemplateData: {
          payload: {
            event: {
              title: eventTitle,
              description: eventDescription || '',
              location: eventLocation || '',
              start_at_human: startHuman,
              end_at_human: endHuman,
              event_id: eventId
            }
          },
          recipient: {
            first_name: firstName,
            email: to
          },
          chapter: {
            name: chapterName
          },
          cta: {
            label: 'View Event',
            url: notificationUrl
          },
          unsubscribe: `{{unsubscribe}}`,
          unsubscribe_preferences: `{{unsubscribe_preferences}}`
        }
      };
  
      await sgMail.send(msg);
      return true;
    } catch (error) {
      console.error('❌ Failed to send event notification email:', error);
      if (error && typeof error === 'object' && 'response' in error) {
        const sgError = error as any;
        console.error('SendGrid Response Body:', JSON.stringify(sgError.response?.body, null, 2));
        console.error('SendGrid Response Headers:', sgError.response?.headers);
      }
      console.error('Error details:', {
        to,
        templateId: process.env.SENDGRID_EVENT_TEMPLATE_ID,
        fromEmail: this.fromEmail,
        hasApiKey: !!process.env.SENDGRID_API_KEY
      });
      return false;
    }
  }

  /**
   * Membership request approved or rejected (marketing alumni / pending invitation queue).
   * Template: SENDGRID_MEMBERSHIP_REQUEST_TEMPLATE_ID (dynamic data matches Handlebars in SendGrid).
   */
  static async sendMembershipRequestDecisionEmail({
    to,
    firstName,
    chapterName,
    approved,
    rejectionReason,
  }: {
    to: string;
    firstName: string;
    chapterName: string;
    approved: boolean;
    rejectionReason?: string | null;
  }): Promise<boolean> {
    const templateId = process.env.SENDGRID_MEMBERSHIP_REQUEST_TEMPLATE_ID;
    if (!templateId) {
      console.warn(
        'SENDGRID_MEMBERSHIP_REQUEST_TEMPLATE_ID not set; skipping membership decision email'
      );
      return false;
    }

    const baseUrl = getEmailBaseUrl().replace(/\/$/, '');
    const dashboardUrl = `${baseUrl}/dashboard`;

    const trimmedReason = rejectionReason?.trim() ?? '';
    const headline = approved
      ? 'Your chapter membership was approved'
      : 'Your membership request was not approved';
    const body = approved
      ? "You now have access to your chapter on Trailblaize. Open the app to finish onboarding if you haven't already."
      : `Your request to join ${chapterName} was not approved at this time.`;

    const membershipPayload: {
      approved: boolean;
      headline: string;
      body: string;
      rejection_reason?: string;
    } = {
      approved,
      headline,
      body,
    };
    if (!approved && trimmedReason) {
      membershipPayload.rejection_reason = trimmedReason;
    }

    try {
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: approved
          ? 'Trailblaize: Your membership was approved'
          : 'Trailblaize: Update on your membership request',
        templateId,
        dynamicTemplateData: {
          payload: {
            membership: membershipPayload,
          },
          recipient: {
            first_name: firstName,
            email: to,
          },
          chapter: {
            name: chapterName,
          },
          cta: {
            label: 'GO TO DASHBOARD',
            url: dashboardUrl,
          },
          unsubscribe: `{{unsubscribe}}`,
          unsubscribe_preferences: `{{unsubscribe_preferences}}`,
        },
      };

      await sgMail.send(msg);
      return true;
    } catch (error) {
      console.error('Failed to send membership request decision email:', error);
      return false;
    }
  }

  /**
   * Alumni peer referral — inviter sends join link to one recipient.
   * Template: SENDGRID_ALUMNI_PEER_INVITE_TEMPLATE_ID (Handlebars: recipient, inviter_name, chapter_name, join_url, product_name, personal_note, unsubscribe).
   */
  static async sendAlumniPeerInviteEmail({
    to,
    recipientFirstName,
    inviterName,
    chapterName,
    joinUrl,
    personalNote,
    productName = 'Trailblaize',
  }: {
    to: string;
    recipientFirstName: string;
    inviterName: string;
    chapterName: string;
    joinUrl: string;
    personalNote?: string | null;
    productName?: string;
  }): Promise<boolean> {
    const templateId = process.env.SENDGRID_ALUMNI_PEER_INVITE_TEMPLATE_ID;
    if (!templateId) {
      console.warn(
        'SENDGRID_ALUMNI_PEER_INVITE_TEMPLATE_ID not set; skipping alumni peer invite email'
      );
      return false;
    }

    const base = getEmailBaseUrl().replace(/\/$/, '');
    const note = personalNote?.trim() ?? '';

    try {
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `${inviterName} invited you to ${chapterName} alumni on ${productName}`,
        templateId,
        dynamicTemplateData: {
          recipient: {
            first_name: recipientFirstName,
            email: to,
          },
          inviter_name: inviterName,
          chapter_name: chapterName,
          join_url: joinUrl,
          product_name: productName,
          personal_note: note,
          unsubscribe: `${base}/unsubscribe?email=${encodeURIComponent(to)}`,
          unsubscribe_preferences: `${base}/preferences?email=${encodeURIComponent(to)}`,
        },
      };

      await sgMail.send(msg);
      return true;
    } catch (error) {
      console.error('Failed to send alumni peer invite email:', error);
      if (error && typeof error === 'object' && 'response' in error) {
        const sgError = error as { response?: { body?: unknown; headers?: unknown } };
        console.error('SendGrid response body:', JSON.stringify(sgError.response?.body, null, 2));
      }
      return false;
    }
  }

  /**
   * New pending membership request — notify platform admins / governance for the chapter (TRA-590).
   * Template: SENDGRID_MEMBERSHIP_REQUEST_ADMIN_TEMPLATE_ID (`payload.new_request`, `cta` deep link).
   */
  static async sendNewMembershipRequestAdminEmail({
    to,
    adminFirstName,
    chapterName,
    applicantName,
    reviewUrl,
  }: {
    to: string;
    adminFirstName: string;
    chapterName: string;
    applicantName: string;
    reviewUrl: string;
  }): Promise<boolean> {
    const templateId = process.env.SENDGRID_MEMBERSHIP_REQUEST_ADMIN_TEMPLATE_ID;
    if (!templateId) {
      console.warn(
        'SENDGRID_MEMBERSHIP_REQUEST_ADMIN_TEMPLATE_ID not set; skipping new membership request admin email'
      );
      return false;
    }

    const applicantDisplayPlain = applicantName.trim() || 'A member';
    const applicantEscapedForHtml = escapeHtmlForEmail(applicantDisplayPlain);
    const headline = 'New membership request';
    const body = `<strong>${applicantEscapedForHtml}</strong> submitted a request to join your chapter after signing up through Trailblaize marketing. Review and approve or decline from your dashboard.`;

    try {
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `Trailblaize: New membership request for ${chapterName}`,
        templateId,
        dynamicTemplateData: {
          payload: {
            new_request: {
              headline,
              body,
              applicant_name: applicantDisplayPlain,
            },
          },
          recipient: {
            first_name: adminFirstName,
            email: to,
          },
          chapter: {
            name: chapterName,
          },
          cta: {
            label: 'REVIEW REQUEST',
            url: reviewUrl,
          },
          unsubscribe: `{{unsubscribe}}`,
          unsubscribe_preferences: `{{unsubscribe_preferences}}`,
        },
      };

      await sgMail.send(msg);
      return true;
    } catch (error) {
      console.error('Failed to send new membership request admin email:', error);
      
      if (error && typeof error === 'object' && 'response' in error) {
        const sgError = error as { response?: { body?: unknown; headers?: unknown }};
        console.error(
          'SendGrid membership admin email response body:',
          JSON.stringify(sgError.response?.body, null, 2)
        );
        console.error('SendGrid response headers:', sgError.response?.headers);
      }

      console.error('Membership admin email debug context:', {
        to,
        templateId: process.env.SENDGRID_MEMBERSHIP_REQUEST_ADMIN_TEMPLATE_ID,
        fromEmail: this.fromEmail,
        hasApiKey: !!process.env.SENDGRID_API_KEY
      });
      
      return false;
    }
  }

  /**
   * NEW: Send event notification to multiple recipients
   */
  static async sendEventToChapter(
    recipients: Array<{
      email: string;
      firstName: string;
      chapterName: string;
    }>,
    eventData: {
      eventTitle: string;
      eventDescription?: string;
      eventLocation?: string;
      eventStartTime: string | null;
      eventEndTime: string | null;
      eventId: string;
    }
  ): Promise<{ successful: number; failed: number }> {
    const results = await Promise.allSettled(
      recipients.map(recipient => 
        this.sendEventNotification({
          to: recipient.email,
          firstName: recipient.firstName,
          chapterName: recipient.chapterName,
          ...eventData
        })
      )
    );

    const successful = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.length - successful;

    return { successful, failed };
  }

  /**
   * Send a password reset email
   */
  static async sendPasswordResetEmail({ to, resetLink, userName }: PasswordResetEmail): Promise<boolean> {
    try {
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: 'Reset Your GreekSpeed Password',
        html: this.getPasswordResetTemplate(resetLink, userName),
        text: this.getPasswordResetTextTemplate(resetLink, userName),
      };

      await sgMail.send(msg);
      // Password reset email sent successfully
      return true;
    } catch (error) {
      console.error('❌ Failed to send password reset email:', error);
      return false;
    }
  }

  /**
   * Send a welcome email to new users
   */
  static async sendWelcomeEmail({ to, userName, chapterName }: WelcomeEmail): Promise<boolean> {
    try {
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `Welcome to GreekSpeed, ${userName}!`,
        html: this.getWelcomeTemplate(userName, chapterName),
        text: this.getWelcomeTextTemplate(userName, chapterName),
      };

      await sgMail.send(msg);
      // Welcome email sent successfully
      return true;
    } catch (error) {
      console.error('❌ Failed to send welcome email:', error);
      return false;
    }
  }

  /**
   * Send a notification email
   */
  static async sendNotificationEmail({ 
    to, 
    userName, 
    title, 
    message, 
    actionUrl, 
    actionText 
  }: NotificationEmail): Promise<boolean> {
    try {
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `GreekSpeed: ${title}`,
        html: this.getNotificationTemplate(userName, title, message, actionUrl, actionText),
        text: this.getNotificationTextTemplate(userName, title, message, actionUrl, actionText),
      };

      await sgMail.send(msg);
      // Notification email sent successfully
      return true;
    } catch (error) {
      console.error('❌ Failed to send notification email:', error);
      return false;
    }
  }

  /**
   * Send a custom email
   */
  static async sendCustomEmail({ to, subject, html, text }: EmailTemplate): Promise<boolean> {
    try {
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject,
        html,
        text,
      };

      await sgMail.send(msg);
      // Custom email sent successfully
      return true;
    } catch (error) {
      console.error('❌ Failed to send custom email:', error);
      return false;
    }
  }

  /**
   * NEW: Send a connection accepted email using dynamic template
   */
  static async sendConnectionAcceptedNotification({
    to,
    firstName,
    chapterName,
    actorFirstName,
    connectionId
  }: ConnectionAcceptedEmail): Promise<boolean> {
    try {
      // Generate magic link with connection context
      const notificationUrl = await this.generateMagicLink(
        to,
        `/dashboard/notifications?connection=${connectionId}`
      );
  
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `${actorFirstName} accepted your connection request on Trailblaize`,
        templateId: process.env.SENDGRID_CONNECTION_ACCEPTED_TEMPLATE_ID!,
        dynamicTemplateData: {
          recipient: {
            first_name: firstName,
            email: to
          },
          actor: {
            first_name: actorFirstName
          },
          chapter: {
            name: chapterName
          },
          cta: {
            label: 'View Connection',
            url: notificationUrl
          },
          unsubscribe: `${getEmailBaseUrl()}/unsubscribe?email=${encodeURIComponent(to)}`,
          unsubscribe_preferences: `${getEmailBaseUrl()}/preferences?email=${encodeURIComponent(to)}`
        },
      };
  
      await sgMail.send(msg);
      return true;
    } catch (error) {
      console.error('Error sending connection accepted email:', error);
      return false;
    }
  }

  /**
   * NEW: Send a connection request email using dynamic template
   */
  static async sendConnectionRequestNotification({
    to,
    firstName,
    chapterName,
    actorFirstName,
    actorLastName,
    actorAvatarUrl,
    message,
    connectionId
  }: ConnectionRequestEmail): Promise<boolean> {
    try {
      // Generate magic link with connection context
      const notificationUrl = await this.generateMagicLink(
        to,
        `/dashboard/notifications?connection=${connectionId}`
      );

      const actorFullName = actorLastName?.trim()
        ? `${actorFirstName} ${actorLastName.trim()}`
        : actorFirstName;
  
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `${actorFullName} wants to connect with you on Trailblaize`,
        templateId: process.env.SENDGRID_CONNECTION_REQUEST_TEMPLATE_ID!,
        dynamicTemplateData: {
          payload: {
            message: message || null
          },
          recipient: {
            first_name: firstName,
            email: to
          },
          actor: {
            first_name: actorFirstName,
            last_name: actorLastName ?? '',
            avatar_url: actorAvatarUrl ?? ''
          },
          chapter: {
            name: chapterName
          },
          cta: {
            label: 'View Request',
            url: notificationUrl
          },
          unsubscribe: `${getEmailBaseUrl()}/unsubscribe?email=${encodeURIComponent(to)}`,
          unsubscribe_preferences: `${getEmailBaseUrl()}/preferences?email=${encodeURIComponent(to)}`
        },
      };
  
      await sgMail.send(msg);
      return true;
    } catch (error) {
      console.error('Error sending connection request email:', error);
      return false;
    }
  }

  /**
   * Send a new message email notification using dynamic template
   */
  static async sendMessageNotification({
    to,
    firstName,
    chapterName,
    actorFirstName,
    messagePreview,
    connectionId
  }: MessageNotificationEmail): Promise<boolean> {
    try {
      // Generate magic link with connection context for messages
      const notificationUrl = await this.generateMagicLink(
        to,
        `/dashboard/messages?connection=${connectionId}`
      );

      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `New message from ${actorFirstName} on Trailblaize`,
        templateId: process.env.SENDGRID_MESSAGE_TEMPLATE_ID!,
        dynamicTemplateData: {
          payload: {
            preview: messagePreview
          },
          recipient: {
            first_name: firstName,
            email: to
          },
          actor: {
            first_name: actorFirstName
          },
          chapter: {
            name: chapterName
          },
          cta: {
            label: 'Open Chat',
            url: notificationUrl
          },
          unsubscribe: `${getEmailBaseUrl()}/unsubscribe?email=${encodeURIComponent(to)}`,
          unsubscribe_preferences: `${getEmailBaseUrl()}/preferences?email=${encodeURIComponent(to)}`
        },
      };

      await sgMail.send(msg);
      // Message notification email sent successfully
      return true;
    } catch (error) {
      console.error('Error sending message notification email:', error);
      return false;
    }
  }

  /**
   * Send email using the generic notification dynamic template.
   * Used for post comment, comment reply, post like, comment like, and inactivity reminder.
   */
  private static async sendGenericNotificationEmail({
    to,
    subject,
    firstName,
    title,
    body,
    ctaLabel,
    ctaUrl,
    templateId: templateIdOverride,
  }: GenericNotificationTemplateData): Promise<boolean> {
    const templateId = templateIdOverride ?? process.env.SENDGRID_GENERIC_NOTIFICATION_TEMPLATE_ID;
    if (!templateId) {
      console.warn('No notification template ID set; skipping email');
      return false;
    }
    try {
      const msg = {
        to,
        from: { email: this.fromEmail, name: this.fromName },
        subject,
        templateId,
        dynamicTemplateData: {
          recipient: { first_name: firstName, email: to },
          title,
          body,
          cta: { label: ctaLabel, url: ctaUrl },
          unsubscribe: `${getEmailBaseUrl()}/unsubscribe?email=${encodeURIComponent(to)}`,
          unsubscribe_preferences: `${getEmailBaseUrl()}/preferences?email=${encodeURIComponent(to)}`,
        },
      };
      await sgMail.send(msg);
      return true;
    } catch (error) {
      console.error('Failed to send generic notification email:', error);
      return false;
    }
  }

  /** Post comment: notify post author when someone comments on their post */
  static async sendPostCommentNotification({
    to,
    firstName,
    chapterName,
    actorFirstName,
    contentPreview,
    postId,
  }: {
    to: string;
    firstName: string;
    chapterName: string;
    actorFirstName: string;
    contentPreview: string;
    postId: string;
  }): Promise<boolean> {
    const baseUrl = getEmailBaseUrl();
    const postUrl = `${baseUrl}/dashboard/post/${postId}`;
    const title = 'New comment on your post';
    const body = contentPreview
      ? `${actorFirstName} commented: "${contentPreview.slice(0, 80)}${contentPreview.length > 80 ? '...' : ''}"`
      : `${actorFirstName} commented on your post.`;
    return this.sendGenericNotificationEmail({
      to,
      subject: `${actorFirstName} commented on your post on Trailblaize`,
      firstName,
      title,
      body,
      ctaLabel: 'View post',
      ctaUrl: postUrl,
      templateId: process.env.SENDGRID_POST_COMMENT_TEMPLATE_ID,
    });
  }

  /** Comment reply: notify parent comment author when someone replies */
  static async sendCommentReplyNotification({
    to,
    firstName,
    chapterName,
    actorFirstName,
    contentPreview,
    postId,
  }: {
    to: string;
    firstName: string;
    chapterName: string;
    actorFirstName: string;
    contentPreview: string;
    postId: string;
  }): Promise<boolean> {
    const baseUrl = getEmailBaseUrl();
    const postUrl = `${baseUrl}/dashboard/post/${postId}`;
    const title = 'New reply to your comment';
    const body = contentPreview
      ? `${actorFirstName} replied: "${contentPreview.slice(0, 80)}${contentPreview.length > 80 ? '...' : ''}"`
      : `${actorFirstName} replied to your comment.`;
    return this.sendGenericNotificationEmail({
      to,
      subject: `${actorFirstName} replied to your comment on Trailblaize`,
      firstName,
      title,
      body,
      ctaLabel: 'View post',
      ctaUrl: postUrl,
      templateId: process.env.SENDGRID_COMMENT_REPLY_TEMPLATE_ID,
    });
  }

  /** Post like: notify post author when someone likes their post */
  static async sendPostLikeNotification({
    to,
    firstName,
    actorFirstName,
    postId,
  }: {
    to: string;
    firstName: string;
    actorFirstName: string;
    postId: string;
  }): Promise<boolean> {
    const baseUrl = getEmailBaseUrl();
    const postUrl = `${baseUrl}/dashboard/post/${postId}`;
    return this.sendGenericNotificationEmail({
      to,
      subject: `${actorFirstName} liked your post on Trailblaize`,
      firstName,
      title: 'Your post was liked',
      body: `${actorFirstName} liked your post.`,
      ctaLabel: 'View post',
      ctaUrl: postUrl,
      templateId: process.env.SENDGRID_POST_LIKE_TEMPLATE_ID,
    });
  }

  /** Comment like: notify comment author when someone likes their comment */
  static async sendCommentLikeNotification({
    to,
    firstName,
    actorFirstName,
    postId,
  }: {
    to: string;
    firstName: string;
    actorFirstName: string;
    postId: string;
  }): Promise<boolean> {
    const baseUrl = getEmailBaseUrl();
    const postUrl = `${baseUrl}/dashboard/post/${postId}`;
    return this.sendGenericNotificationEmail({
      to,
      subject: `${actorFirstName} liked your comment on Trailblaize`,
      firstName,
      title: 'Your comment was liked',
      body: `${actorFirstName} liked your comment.`,
      ctaLabel: 'View post',
      ctaUrl: postUrl,
      templateId: process.env.SENDGRID_COMMENT_LIKE_TEMPLATE_ID,
    });
  }

  /** Inactivity reminder: re-engage users who have not been active for 30+ days */
  static async sendInactivityReminderEmail({
    to,
    firstName,
    chapterName,
  }: {
    to: string;
    firstName: string;
    chapterName: string;
  }): Promise<boolean> {
    const baseUrl = getEmailBaseUrl();
    const dashboardUrl = `${baseUrl}/dashboard`;
    return this.sendGenericNotificationEmail({
      to,
      subject: "We haven't seen you in a while on Trailblaize",
      firstName,
      title: "We miss you",
      body: `It's been a while since you've been on Trailblaize. Your ${chapterName} community is here when you're ready to catch up.`,
      ctaLabel: 'Open Trailblaize',
      ctaUrl: dashboardUrl,
      templateId: process.env.SENDGRID_INACTIVITY_REMINDER_TEMPLATE_ID,
    });
  }

  // Email Templates
  private static getPasswordResetTemplate(resetLink: string, userName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
            <p>GreekSpeed Alumni Network</p>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>We received a request to reset your password for your GreekSpeed account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetLink}" class="button">Reset My Password</a>
            <p><strong>This link will expire in 1 hour for security reasons.</strong></p>
            <p>If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
          </div>
          <div class="footer">
            <p>© 2024 GreekSpeed. All rights reserved.</p>
            <p>This email was sent from a notification-only address that cannot accept incoming email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getPasswordResetTextTemplate(resetLink: string, userName: string): string {
    return `
      Password Reset Request - GreekSpeed Alumni Network
      
      Hello ${userName},
      
      We received a request to reset your password for your GreekSpeed account.
      
      To reset your password, visit this link:
      ${resetLink}
      
      This link will expire in 1 hour for security reasons.
      
      If you didn't request this password reset, please ignore this email or contact support if you have concerns.
      
      ---
      © 2024 GreekSpeed. All rights reserved.
      This email was sent from a notification-only address that cannot accept incoming email.
    `;
  }

  private static getWelcomeTemplate(userName: string, chapterName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to GreekSpeed</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #1e40af; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to GreekSpeed!</h1>
            <p>Your Alumni Network Awaits</p>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>Welcome to GreekSpeed! We're excited to have you join the ${chapterName} alumni network.</p>
            
            <h3>What you can do now:</h3>
            <div class="feature">
              <strong>📱 Complete Your Profile</strong><br>
              Add your professional information, current role, and contact details.
            </div>
            <div class="feature">
              <strong>🔗 Connect with Alumni</strong><br>
              Find and connect with fellow alumni from your chapter and others.
            </div>
            <div class="feature">
              <strong>📢 Stay Updated</strong><br>
              Receive announcements and updates from your chapter.
            </div>
            <div class="feature">
              <strong>💼 Professional Network</strong><br>
              Discover career opportunities and professional connections.
            </div>
            
            <a href="${getEmailBaseUrl()}/dashboard" class="button">Get Started</a>
            
            <p>If you have any questions, feel free to reach out to our support team.</p>
          </div>
          <div class="footer">
            <p>© 2024 GreekSpeed. All rights reserved.</p>
            <p>This email was sent from a notification-only address that cannot accept incoming email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getWelcomeTextTemplate(userName: string, chapterName: string): string {
    return `
      Welcome to GreekSpeed! - Your Alumni Network Awaits
      
      Hello ${userName},
      
      Welcome to GreekSpeed! We're excited to have you join the ${chapterName} alumni network.
      
      What you can do now:
      
      📱 Complete Your Profile
      Add your professional information, current role, and contact details.
      
      🔗 Connect with Alumni
      Find and connect with fellow alumni from your chapter and others.
      
      📢 Stay Updated
      Receive announcements and updates from your chapter.
      
      💼 Professional Network
      Discover career opportunities and professional connections.
      
      Get started: ${getEmailBaseUrl()}/dashboard
      
      If you have any questions, feel free to reach out to our support team.
      
      ---
      © 2024 GreekSpeed. All rights reserved.
      This email was sent from a notification-only address that cannot accept incoming email.
    `;
  }

  private static getNotificationTemplate(
    userName: string, 
    title: string, 
    message: string, 
    actionUrl?: string, 
    actionText?: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📢 ${title}</h1>
            <p>GreekSpeed Alumni Network</p>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>${message}</p>
            ${actionUrl && actionText ? `<a href="${actionUrl}" class="button">${actionText}</a>` : ''}
            <p>Stay connected with your alumni network!</p>
          </div>
          <div class="footer">
            <p>© 2024 GreekSpeed. All rights reserved.</p>
            <p>This email was sent from a notification-only address that cannot accept incoming email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getNotificationTextTemplate(
    userName: string, 
    title: string, 
    message: string, 
    actionUrl?: string, 
    actionText?: string
  ): string {
    return `
      ${title} - GreekSpeed Alumni Network
      
      Hello ${userName},
      
      ${message}
      
      ${actionUrl && actionText ? `${actionText}: ${actionUrl}` : ''}
      
      Stay connected with your alumni network!
      
      ---
      © 2024 GreekSpeed. All rights reserved.
      This email was sent from a notification-only address that cannot accept incoming email.
    `;
  }

  /**
   * Send event reminder emails to users who haven't RSVP'd
   */
  static async sendEventReminderToChapter(
    recipients: Array<{ email: string; firstName: string; chapterName: string }>,
    eventData: {
      eventTitle: string;
      eventDescription?: string;
      eventLocation?: string;
      eventStartTime: string | null;
      eventEndTime: string | null;
      eventId: string;
      startAtRelative?: string;
    }
  ): Promise<{ successful: number; failed: number }> {
    const results = await Promise.allSettled(
      recipients.map(recipient => 
        this.sendEventReminder({
          to: recipient.email,
          firstName: recipient.firstName,
          chapterName: recipient.chapterName,
          ...eventData
        })
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return { successful, failed };
  }

  /**
   * Send individual event reminder email
   */
  static async sendEventReminder({
    to,
    firstName,
    chapterName,
    eventTitle,
    eventDescription,
    eventLocation,
    eventStartTime,
    eventEndTime,
    eventId,
    startAtRelative
  }: {
    to: string;
    firstName: string;
    chapterName: string;
    eventTitle: string;
    eventDescription?: string;
    eventLocation?: string;
    eventStartTime: string | null;
    eventEndTime: string | null;
    eventId: string;
    startAtRelative?: string;
  }): Promise<boolean> {
    try {
      const formatDateTime = (date: Date) => {
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        });
      };

      const startHuman = eventStartTime ? formatDateTime(new Date(eventStartTime)) : 'Time TBD';

      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `Event Reminder: ${eventTitle}`,
        templateId: process.env.SENDGRID_EVENT_REMINDER_TEMPLATE_ID!,
        dynamicTemplateData: {
          recipient: {
            first_name: firstName
          },
          chapter: {
            name: chapterName
          },
          payload: {
            event: {
              title: eventTitle,
              description: eventDescription || '',
              location: eventLocation || '',
              start_at_human: startHuman,
              start_at_relative:
                startAtRelative ||
                (eventStartTime ? this.getRelativeTime(new Date(eventStartTime)) : 'Time TBD')
            }
          },
          cta: {
            url: 'https://www.trailblaize.net'
          },
          unsubscribe: `{{unsubscribe}}`,
          unsubscribe_preferences: `{{unsubscribe_preferences}}`
        }
      };

      await sgMail.send(msg);
      // Event reminder email sent successfully
      return true;
    } catch (error) {
      console.error(`❌ Failed to send event reminder email to: ${to}`, error);
      return false;
    }
  }

  /**
   * Get relative time string (e.g., "in 2 hours", "tomorrow")
   */
  private static getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays === 0) {
      if (diffHours <= 0) {
        return 'now';
      } else if (diffHours === 1) {
        return 'in 1 hour';
      } else {
        return `in ${diffHours} hours`;
      }
    } else if (diffDays === 1) {
      return 'tomorrow';
    } else {
      return `in ${diffDays} days`;
    }
  }

  /**
   * Send password change confirmation email using dynamic template
   */
  static async sendPasswordChangeConfirmation({
    to,
    firstName,
    chapterName,
    timestamp,
    deviceInfo
  }: PasswordChangeConfirmationEmail): Promise<boolean> {
    try {
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: '✅ Password Successfully Changed - GreekSpeed',
        templateId: process.env.SENDGRID_PASSWORD_CHANGE_TEMPLATE_ID!,
        dynamicTemplateData: {
          recipient: {
            first_name: firstName,
            email: to
          },
          chapter: {
            name: chapterName
          },
          timestamp: timestamp,
          device_info: deviceInfo || 'Unknown Device',
          dashboard_link: `${getEmailBaseUrl()}/dashboard`
        }
      };

      await sgMail.send(msg);
      return true;
    } catch (error) {
      console.error('❌ Failed to send password change confirmation email:', error);
      return false;
    }
  }

  /**
   * Send password reset instructions email using dynamic template
   */
  static async sendPasswordResetInstructions({
    to,
    firstName,
    chapterName,
    resetLink,
    timestamp
  }: PasswordResetInstructionsEmail): Promise<boolean> {
    try {
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: 'Reset Your GreekSpeed Password',
        templateId: process.env.SENDGRID_PASSWORD_RESET_TEMPLATE_ID!,
        dynamicTemplateData: {
          recipient: {
            first_name: firstName,
            email: to
          },
          chapter: {
            name: chapterName
          },
          reset_link: resetLink,
          timestamp: timestamp
        }
      };

      await sgMail.send(msg);
      return true;
    } catch (error) {
      console.error('❌ Failed to send password reset instructions email:', error);
      return false;
    }
  }

  private static async generateMagicLink(
    email: string,
    redirectPath: string
  ): Promise<string> {
    try {
      const supabase = createServerSupabaseClient();
      const baseUrl = getEmailBaseUrl();
      
      // Generate magic link with redirect
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: email.toLowerCase(),
        options: {
          redirectTo: `${baseUrl}${redirectPath}`,
        }
      });
  
      if (linkError || !linkData?.properties?.action_link) {
        console.error('Failed to generate magic link:', linkError);
        // Fallback to regular link if magic link generation fails
        return `${baseUrl}${redirectPath}`;
      }
  
      return linkData.properties.action_link;
    } catch (error) {
      console.error('Error generating magic link:', error);
      // Fallback to regular link on error
      return `${getEmailBaseUrl()}${redirectPath}`;
    }
  }
}

