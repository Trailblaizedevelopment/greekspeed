import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailService } from '@/lib/services/emailService';
import { SMSService } from '@/lib/services/sms/smsServiceTelnyx';
import { SMSNotificationService } from '@/lib/services/sms/smsNotificationService';
import { canSendEmailNotification } from '@/lib/utils/checkEmailPreferences';
import { buildPushPayload } from '@/lib/services/notificationPushPayload';
import { sendPushToUser } from '@/lib/services/oneSignalPushService';
import { generateEventLink } from '@/lib/utils/eventLinkUtils';

export type ChapterEventNotificationDispatchParams = {
  eventId: string;
  chapterId: string;
  send_sms: boolean;
  send_sms_to_alumni: boolean;
};

export type ChapterEventNotificationDispatchSuccess = {
  ok: true;
  totalRecipients: number;
  successful: number;
  failed: number;
};

export type ChapterEventNotificationDispatchFailure = {
  ok: false;
  status: number;
  error: string;
};

export type ChapterEventNotificationDispatchResult =
  | ChapterEventNotificationDispatchSuccess
  | ChapterEventNotificationDispatchFailure;

function mergeEventMetadata(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch };
}

/**
 * Sends the same chapter notifications as publishing a new event: filtered bulk email,
 * new_event push, optional SMS to actives and optional SMS to alumni (when visibility allows).
 * Uses the service-role Supabase client for reads/writes.
 */
export async function dispatchChapterEventPublishedNotifications(
  supabase: SupabaseClient,
  params: ChapterEventNotificationDispatchParams
): Promise<ChapterEventNotificationDispatchResult> {
  const { eventId, chapterId, send_sms, send_sms_to_alumni } = params;

  if (!eventId || !chapterId) {
    return { ok: false, status: 400, error: 'Event ID and Chapter ID are required' };
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('chapter_id', chapterId)
    .single();

  if (eventError || !event) {
    console.error('dispatchChapterEventPublishedNotifications: event not found', eventError);
    return { ok: false, status: 404, error: 'Event not found' };
  }

  const notifyActiveMembers = event.visible_to_active_members ?? true;
  const notifyAlumniAudience = event.visible_to_alumni ?? true;

  let members: Array<{
    id: string;
    email: string | null;
    first_name: string | null;
    chapter_id: string;
    role: string;
  }> | null = null;

  if (notifyActiveMembers) {
    const { data, error: membersError } = await supabase
      .from('profiles')
      .select('id, email, first_name, chapter_id, role')
      .eq('chapter_id', chapterId)
      .in('role', ['active_member', 'admin'])
      .neq('is_developer', true)
      .not('email', 'is', null);

    if (membersError) {
      console.error('Error fetching chapter members:', membersError);
      return { ok: false, status: 500, error: 'Failed to fetch chapter members' };
    }
    members = data ?? [];
  } else {
    members = [];
  }

  if (members.length === 0 && notifyActiveMembers) {
    return { ok: false, status: 404, error: 'No active members found for this chapter' };
  }

  type EventEmailProfile = {
    id: string;
    email: string | null;
    first_name: string | null;
    chapter_id: string;
    role: string;
  };

  let alumniMembers: EventEmailProfile[] = [];
  if (notifyAlumniAudience) {
    const { data: alumniData, error: alumniFetchError } = await supabase
      .from('profiles')
      .select('id, email, first_name, chapter_id, role')
      .eq('chapter_id', chapterId)
      .eq('role', 'alumni')
      .neq('is_developer', true)
      .not('email', 'is', null);

    if (alumniFetchError) {
      console.error('Error fetching chapter alumni for event email:', alumniFetchError);
      return { ok: false, status: 500, error: 'Failed to fetch chapter alumni' };
    }
    alumniMembers = (alumniData ?? []) as EventEmailProfile[];
  }

  const { data: chapter, error: chapterError } = await supabase
    .from('spaces')
    .select('name')
    .eq('id', chapterId)
    .single();

  if (chapterError || !chapter) {
    console.error('Error fetching chapter:', chapterError);
    return { ok: false, status: 404, error: 'Chapter not found' };
  }

  const allowedMembers = await Promise.all(
    (members || []).map(async (member) => {
      try {
        const allowed = await canSendEmailNotification(member.id as string, 'event');
        return allowed ? member : null;
      } catch {
        return null;
      }
    })
  );

  const allowedList = allowedMembers.filter((m): m is NonNullable<typeof m> => Boolean(m));

  const allowedAlumni = await Promise.all(
    alumniMembers.map(async (alum) => {
      try {
        const allowed = await canSendEmailNotification(alum.id, 'event');
        return allowed ? alum : null;
      } catch {
        return null;
      }
    })
  );
  const allowedAlumniList = allowedAlumni.filter(
    (m): m is NonNullable<(typeof allowedAlumni)[number]> => Boolean(m)
  );

  const toRecipientRow = (member: { email: string | null; first_name: string | null }) => ({
    email: member.email as string,
    firstName: member.first_name || 'Member',
    chapterName: chapter.name,
  });

  const recipientRows: Array<{ email: string; firstName: string; chapterName: string; _id: string }> = [];
  const seenRecipientIds = new Set<string>();
  for (const member of allowedList) {
    if (!member.email || seenRecipientIds.has(member.id)) continue;
    seenRecipientIds.add(member.id);
    recipientRows.push({ ...toRecipientRow(member), _id: member.id });
  }
  for (const alum of allowedAlumniList) {
    if (!alum.email || seenRecipientIds.has(alum.id)) continue;
    seenRecipientIds.add(alum.id);
    recipientRows.push({ ...toRecipientRow(alum), _id: alum.id });
  }

  const recipients = recipientRows.map(({ _id: _unused, ...r }) => r);

  const emailResult = await EmailService.sendEventToChapter(recipients, {
    eventTitle: event.title,
    eventDescription: event.description,
    eventLocation: event.location,
    eventStartTime: event.start_time,
    eventEndTime: event.end_time,
    eventId: event.id,
  });

  const pushPayload = buildPushPayload('new_event', {
    eventId: event.id,
    eventSlug: event.slug ?? null,
    eventTitle: event.title,
  });
  const pushUserIds = [...new Set([...allowedList, ...allowedAlumniList].map((m) => m.id))];
  for (const userId of pushUserIds) {
    sendPushToUser(userId, pushPayload).catch((pushErr) => {
      console.error('Failed to send new event push to', userId, pushErr);
    });
  }

  if (send_sms === true && notifyActiveMembers) {
    try {
      const { data: smsMembers, error: smsMembersError } = await supabase
        .from('profiles')
        .select(
          `
            id,
            phone,
            first_name,
            chapter_id,
            role,
            sms_consent  
          `
        )
        .eq('chapter_id', chapterId)
        .in('role', ['active_member', 'admin'])
        .neq('is_developer', true)
        .not('phone', 'is', null)
        .neq('phone', '')
        .eq('sms_consent', true);

      if (smsMembersError) {
        console.error('Error fetching SMS members:', smsMembersError);
      } else if (smsMembers && smsMembers.length > 0) {
        const validSMSMembers = smsMembers
          .map((member) => ({
            ...member,
            formattedPhone: SMSService.formatPhoneNumber(member.phone!),
          }))
          .filter((member) => SMSService.isValidPhoneNumber(member.phone!));

        if (validSMSMembers.length > 0) {
          const formattedDate = event.start_time
            ? new Date(event.start_time).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
            : 'Time TBD';

          const isSandbox = SMSService.isInSandboxMode();
          const membersToNotify = isSandbox ? validSMSMembers.slice(0, 3) : validSMSMembers;
          const eventLink = generateEventLink(event.id, event.slug ?? null, { ref: 'sms' });
          Promise.all(
            membersToNotify.map((member) =>
              SMSNotificationService.sendEventNotification(
                member.formattedPhone,
                member.first_name || 'Member',
                event.title,
                formattedDate,
                member.id,
                chapterId,
                { link: eventLink }
              )
            )
          ).catch((error) => {
            console.error('Event SMS notifications failed:', error);
          });
        }
      }
    } catch (smsError) {
      console.error('Error in SMS notification process:', smsError);
    }
  }

  if (send_sms_to_alumni === true && notifyAlumniAudience) {
    try {
      const { data: alumni, error: alumniError } = await supabase
        .from('profiles')
        .select(
          `
              id,
              phone,
              first_name,
              chapter_id,
              role,
              sms_consent
            `
        )
        .eq('chapter_id', chapterId)
        .eq('role', 'alumni')
        .neq('is_developer', true)
        .not('phone', 'is', null)
        .neq('phone', '')
        .eq('sms_consent', true);

      if (alumniError) {
        console.error('Error fetching alumni for SMS:', alumniError);
      } else if (alumni && alumni.length > 0) {
        const validAlumni = alumni
          .map((alum) => ({
            ...alum,
            formattedPhone: SMSService.formatPhoneNumber(alum.phone!),
          }))
          .filter((alum) => SMSService.isValidPhoneNumber(alum.phone!));

        if (validAlumni.length > 0) {
          const formattedDate = event.start_time
            ? new Date(event.start_time).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
            : 'Time TBD';

          const isSandbox = SMSService.isInSandboxMode();
          const alumniToNotify = isSandbox ? validAlumni.slice(0, 3) : validAlumni;
          const eventLink = generateEventLink(event.id, event.slug ?? null, { ref: 'sms' });
          Promise.all(
            alumniToNotify.map((alum) =>
              SMSNotificationService.sendEventNotification(
                alum.formattedPhone,
                alum.first_name || 'Alumni',
                event.title,
                formattedDate,
                alum.id,
                chapterId,
                { link: eventLink }
              )
            )
          ).catch((error) => {
            console.error('Event SMS notifications to alumni failed:', error);
          });
        }
      }
    } catch (smsError) {
      console.error('Error in alumni SMS notification process:', smsError);
    }
  }

  const sentAt = new Date().toISOString();
  const nextMetadata = mergeEventMetadata(event.metadata, {
    email_sent: true,
    email_sent_at: sentAt,
    email_recipients: recipients.length,
    email_successful: emailResult.successful,
    email_failed: emailResult.failed,
    last_notification_sent_at: sentAt,
    last_publish_send_sms: send_sms,
    last_publish_send_sms_to_alumni: send_sms_to_alumni,
  });

  const { error: updateError } = await supabase
    .from('events')
    .update({ metadata: nextMetadata })
    .eq('id', eventId);

  if (updateError) {
    console.error('Error updating event metadata:', updateError);
  }

  return {
    ok: true,
    totalRecipients: recipients.length,
    successful: emailResult.successful,
    failed: emailResult.failed,
  };
}
