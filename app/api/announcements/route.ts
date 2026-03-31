import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { SMSService } from '@/lib/services/sms/smsServiceTelnyx';
import { SMSMessageFormatter } from '@/lib/services/sms/smsMessageFormatter';
import { SMSNotificationService } from '@/lib/services/sms/smsNotificationService';
import { canSendEmailNotification } from '@/lib/utils/checkEmailPreferences';
import {
  getFirstAnnouncementImageFromMetadata,
  sanitizeAnnouncementMetadataForCreate,
  type SanitizedAnnouncementMetadata,
} from '@/lib/validation/announcementMetadata';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { canManageChapterForContext, type ProfileForPermission } from '@/lib/permissions';

// Configure function timeout for Vercel (60 seconds for Pro plan)
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID required' }, { status: 400 });
    }

    // Get authenticated user to check read status
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Fetch announcements with sender information and read status for current user
    const { data: announcements, error } = await supabase
      .from('announcements')
      .select(`
        *,
        sender:profiles!sender_id(
          id,
          full_name,
          first_name,
          last_name,
          avatar_url
        ),
        recipients:announcement_recipients!inner(
          is_read,
          read_at
        )
      `)
      .eq('chapter_id', chapterId)
      .eq('recipients.recipient_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Announcements fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch announcements' }, { status: 500 });
    }

    // Transform the data to include read status
    const transformedAnnouncements = announcements?.map(announcement => ({
      ...announcement,
      is_read: announcement.recipients?.[0]?.is_read || false,
      read_at: announcement.recipients?.[0]?.read_at || null
    })) || [];

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('announcements')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId);

      return NextResponse.json(
        {
          announcements: transformedAnnouncements,
          pagination: {
            page,
            limit,
            total: totalCount || 0,
            totalPages: Math.ceil((totalCount || 0) / limit),
          },
        },
        {
          headers: {
            'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
          },
        }
      );
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const {
      title,
      content,
      announcement_type,
      is_scheduled,
      scheduled_at,
      send_sms,
      send_sms_to_alumni,
      send_email_to_members,
      send_email_to_alumni,
      metadata,
      chapter_ids,
    } = body;

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    // Get user profile to verify chapter and role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, chapter_role, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.chapter_id) {
      return NextResponse.json({ error: 'User not associated with a chapter' }, { status: 400 });
    }

    const allowedChapterRoles = ['president', 'vice_president', 'secretary', 'treasurer', 'executive_board'];
    const isSystemAdmin = profile.role === 'admin';
    const isGovernance = profile.role === 'governance';
    const hasChapterRole = profile.chapter_role && allowedChapterRoles.includes(profile.chapter_role);

    if (!isSystemAdmin && !isGovernance && !hasChapterRole) {
      return NextResponse.json({ 
        error: 'Insufficient permissions. Only admins, presidents, vice presidents, secretaries, treasurers, and executive board members can create announcements.' 
      }, { status: 403 });
    }

    const metadataResult = sanitizeAnnouncementMetadataForCreate(metadata, supabaseUrl);
    if (!metadataResult.ok) {
      return NextResponse.json(
        {
          error: metadataResult.error,
          ...(metadataResult.details ? { details: metadataResult.details } : {}),
        },
        { status: 400 }
      );
    }

    // --- Multi-chapter broadcast path (governance / admin with chapter_ids) ---
    const isMultiChapter = Array.isArray(chapter_ids) && chapter_ids.length > 0;

    if (isMultiChapter) {
      if (!isGovernance && !isSystemAdmin) {
        return NextResponse.json(
          { error: 'Only governance and system admin users can broadcast to multiple chapters' },
          { status: 403 }
        );
      }

      if (!chapter_ids.every((id: unknown) => typeof id === 'string' && id.length > 0)) {
        return NextResponse.json({ error: 'Each chapter_id must be a non-empty string' }, { status: 400 });
      }

      let managedIds: string[] | undefined;
      if (isGovernance) {
        managedIds = await getManagedChapterIds(supabase, user.id);
      }

      const profileForPerm: ProfileForPermission = {
        role: profile.role,
        chapter_id: profile.chapter_id,
        chapter_role: profile.chapter_role,
      };

      for (const cid of chapter_ids as string[]) {
        if (!canManageChapterForContext(profileForPerm, cid, managedIds)) {
          return NextResponse.json(
            { error: `Not authorized to manage chapter ${cid}` },
            { status: 403 }
          );
        }
      }

      const deliveryFlags: DeliveryFlags = { send_sms, send_sms_to_alumni, send_email_to_members, send_email_to_alumni };
      const announcementFields: AnnouncementFields = {
        title,
        content,
        announcement_type,
        is_scheduled: is_scheduled || false,
        scheduled_at: scheduled_at || null,
        metadata: metadataResult.metadata,
      };

      const results: Array<{ chapter_id: string; announcement: AnnouncementRow | null; error?: string }> = [];
      for (const targetChapterId of chapter_ids as string[]) {
        try {
          const ann = await createAnnouncementForChapter(
            supabase, user.id, targetChapterId, announcementFields, deliveryFlags
          );
          results.push({ chapter_id: targetChapterId, announcement: ann });
        } catch (err) {
          console.error(`Failed to create announcement for chapter ${targetChapterId}:`, err);
          results.push({
            chapter_id: targetChapterId,
            announcement: null,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      return NextResponse.json({ announcements: results });
    }

    // --- Single-chapter path (existing behavior for exec / chapter admins) ---
    const announcement = await createAnnouncementForChapter(
      supabase,
      user.id,
      profile.chapter_id,
      {
        title,
        content,
        announcement_type,
        is_scheduled: is_scheduled || false,
        scheduled_at: scheduled_at || null,
        metadata: metadataResult.metadata,
      },
      { send_sms, send_sms_to_alumni, send_email_to_members, send_email_to_alumni }
    );

    return NextResponse.json({ announcement });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shape of the row returned by the announcement insert + select. */
interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  announcement_type: 'general' | 'urgent' | 'event' | 'academic';
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

interface AnnouncementFields {
  title: string;
  content: string;
  announcement_type: string;
  is_scheduled: boolean;
  scheduled_at: string | null;
  metadata: SanitizedAnnouncementMetadata;
}

interface DeliveryFlags {
  send_sms?: boolean;
  send_sms_to_alumni?: boolean;
  send_email_to_members?: boolean;
  send_email_to_alumni?: boolean;
}

/**
 * Creates a single announcement row for a given chapter and dispatches
 * all notification channels (email, SMS, push) per the delivery flags.
 * Extracted so multi-chapter broadcasts can call it in a loop.
 */
async function createAnnouncementForChapter(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  senderId: string,
  chapterId: string,
  fields: AnnouncementFields,
  flags: DeliveryFlags,
): Promise<AnnouncementRow> {
  const { data: announcement, error: createError } = await supabase
    .from('announcements')
    .insert({
      chapter_id: chapterId,
      sender_id: senderId,
      title: fields.title,
      content: fields.content,
      announcement_type: fields.announcement_type,
      is_scheduled: fields.is_scheduled,
      scheduled_at: fields.scheduled_at,
      metadata: fields.metadata,
      is_sent: !fields.is_scheduled,
      sent_at: !fields.is_scheduled ? new Date().toISOString() : null,
    })
    .select(`
      *,
      sender:profiles!sender_id(
        id,
        full_name,
        first_name,
        last_name,
        avatar_url
      )
    `)
    .single();

  if (createError || !announcement) {
    throw new Error(createError?.message || 'Failed to create announcement');
  }

  const announcementImage = getFirstAnnouncementImageFromMetadata(announcement.metadata);
  const emailImageUrl = announcementImage?.url ?? null;
  const emailImageAlt = announcementImage?.alt ?? null;
  const smsMediaUrl = announcementImage?.url ?? null;

  if (!fields.is_scheduled) {
    await createRecipientRecords(announcement.id, chapterId, supabase);

    if (flags.send_email_to_members === true) {
      await sendMemberEmails(supabase, announcement, chapterId, emailImageUrl, emailImageAlt);
    }

    if (flags.send_email_to_alumni === true) {
      await sendAlumniEmails(supabase, announcement, chapterId, emailImageUrl, emailImageAlt);
    }

    if (flags.send_sms === true) {
      await sendMemberSms(supabase, announcement, chapterId, senderId, smsMediaUrl);
    }

    if (flags.send_sms_to_alumni === true) {
      await sendAlumniSms(supabase, announcement, chapterId, senderId, smsMediaUrl);
    }
  }

  return announcement;
}

async function createRecipientRecords(
  announcementId: string,
  chapterId: string,
  supabase: ReturnType<typeof createServerSupabaseClient>,
) {
  try {
    const { data: members, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('chapter_id', chapterId)
      .eq('role', 'active_member')
      .neq('is_developer', true);

    if (error || !members) {
      console.error('Failed to fetch chapter members:', error);
      return;
    }

    const recipientRecords = members.map((member: { id: string }) => ({
      announcement_id: announcementId,
      recipient_id: member.id,
    }));

    if (recipientRecords.length === 0) return;

    const { error: insertError } = await supabase
      .from('announcement_recipients')
      .insert(recipientRecords);

    if (insertError) {
      console.error('Failed to create recipient records:', insertError);
    }
  } catch (error) {
    console.error('Error creating recipient records:', error);
  }
}

async function sendMemberEmails(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  announcement: AnnouncementRow,
  chapterId: string,
  emailImageUrl: string | null,
  emailImageAlt: string | null,
) {
  try {
    const { data: chapter } = await supabase
      .from('chapters')
      .select('name')
      .eq('id', chapterId)
      .single();

    const chapterName = chapter?.name || 'Your Chapter';

    const { data: members, error: membersError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, chapter_id, role')
      .eq('chapter_id', chapterId)
      .in('role', ['active_member', 'admin'])
      .neq('is_developer', true)
      .not('email', 'is', null);

    if (membersError) {
      console.error('❌ Failed to fetch chapter members for email:', membersError);
      return;
    }

    if (!members || members.length === 0) return;

    const allowedMembers = await Promise.all(
      members.map(async (member) => {
        try {
          const allowed = await canSendEmailNotification(member.id, 'announcement');
          return allowed ? member : null;
        } catch {
          return null;
        }
      })
    );

    const allowedList = allowedMembers.filter((m): m is NonNullable<typeof m> => Boolean(m));
    const recipients = allowedList.map(member => ({
      email: member.email,
      firstName: member.first_name || 'Member',
      chapterName,
    }));

    if (recipients.length > 0) {
      const { EmailService } = await import('@/lib/services/emailService');
      await EmailService.sendAnnouncementToChapter(recipients, {
        title: announcement.title,
        summary: '',
        content: announcement.content,
        announcementId: announcement.id,
        announcementType: announcement.announcement_type,
        imageUrl: emailImageUrl,
        imageAlt: emailImageAlt,
      });
      console.log('Email sent to members:', recipients.length, 'recipients');

      const { buildPushPayload } = await import('@/lib/services/notificationPushPayload');
      const { sendPushToUser } = await import('@/lib/services/oneSignalPushService');
      const pushPayload = buildPushPayload('chapter_announcement', {
        announcementId: announcement.id,
        announcementTitle: announcement.title,
      });
      for (const member of allowedList) {
        sendPushToUser(member.id, pushPayload).catch(pushErr => {
          console.error('Failed to send announcement push to', member.id, pushErr);
        });
      }
    }
  } catch (emailError) {
    console.error('❌ Error sending member announcement emails:', emailError);
  }
}

async function sendAlumniEmails(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  announcement: AnnouncementRow,
  chapterId: string,
  emailImageUrl: string | null,
  emailImageAlt: string | null,
) {
  try {
    const { data: chapter } = await supabase
      .from('chapters')
      .select('name')
      .eq('id', chapterId)
      .single();

    const chapterName = chapter?.name || 'Your Chapter';

    const { data: alumniMembers, error: alumniEmailError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('chapter_id', chapterId)
      .eq('role', 'alumni')
      .neq('is_developer', true)
      .not('email', 'is', null);

    if (alumniEmailError) {
      console.error('❌ Failed to fetch alumni for email:', alumniEmailError);
      return;
    }

    if (!alumniMembers || alumniMembers.length === 0) return;

    const allowedAlumni = await Promise.all(
      alumniMembers.map(async (alum) => {
        try {
          const allowed = await canSendEmailNotification(alum.id, 'announcement');
          return allowed ? alum : null;
        } catch {
          return null;
        }
      })
    );

    const alumniRecipients = allowedAlumni
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map(alum => ({
        email: alum.email,
        firstName: alum.first_name || 'Alumni',
        chapterName,
      }));

    if (alumniRecipients.length > 0) {
      const { EmailService } = await import('@/lib/services/emailService');
      await EmailService.sendAnnouncementToChapter(alumniRecipients, {
        title: announcement.title,
        summary: '',
        content: announcement.content,
        announcementId: announcement.id,
        announcementType: announcement.announcement_type,
        imageUrl: emailImageUrl,
        imageAlt: emailImageAlt,
      });
      console.log('Email sent to alumni:', alumniRecipients.length, 'recipients');
    }
  } catch (alumniEmailError) {
    console.error('❌ Error sending alumni announcement emails:', alumniEmailError);
  }
}

async function sendMemberSms(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  announcement: AnnouncementRow,
  chapterId: string,
  senderId: string,
  smsMediaUrl: string | null,
) {
  try {
    const { data: smsMembers, error: smsMembersError } = await supabase
      .from('profiles')
      .select('id, phone, first_name, chapter_id, role')
      .eq('chapter_id', chapterId)
      .in('role', ['active_member', 'admin'])
      .neq('is_developer', true)
      .not('phone', 'is', null)
      .neq('phone', '')
      .eq('sms_consent', true);

    if (smsMembersError || !smsMembers || smsMembers.length === 0) return;

    const validSMSMembers = smsMembers
      .map(member => ({ ...member, formattedPhone: SMSService.formatPhoneNumber(member.phone!) }))
      .filter(member => SMSService.isValidPhoneNumber(member.phone!));

    if (validSMSMembers.length === 0) return;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const link = `${baseUrl}/dashboard/announcements`;
    const headline = announcement.title.slice(0, 40);
    const detail = announcement.content.slice(0, 60).replace(/\s+/g, ' ').trim();

    const receivedSet = await SMSNotificationService.getUserIdSetThatHaveReceivedSms(
      validSMSMembers.map(m => m.id)
    );
    const isSandbox = SMSService.isInSandboxMode();
    const recipientsToUse = isSandbox ? validSMSMembers.slice(0, 3) : validSMSMembers;
    const firstTime = recipientsToUse.filter(m => !receivedSet.has(m.id));
    const returning = recipientsToUse.filter(m => receivedSet.has(m.id));

    const messagePartsFull = SMSMessageFormatter.formatShortMessage(
      headline, detail, 'Read more', link, { complianceLevel: 'full' }
    );
    const messagePartsNone = SMSMessageFormatter.formatShortMessage(
      headline, detail, 'Read more', link, { complianceLevel: 'none' }
    );

    if (recipientsToUse.length === 0) return;

    try {
      let totalSuccess = 0;
      let totalFailed = 0;
      if (firstTime.length > 0) {
        const resultFull = await SMSService.sendBulkSMS(
          firstTime.map(m => m.formattedPhone),
          messagePartsFull.fullMessage,
          { mediaUrl: smsMediaUrl, logContext: { announcementId: announcement.id, channel: 'members', segment: 'first_time' } }
        );
        totalSuccess += resultFull.success;
        totalFailed += resultFull.failed;
      }
      if (returning.length > 0) {
        const resultNone = await SMSService.sendBulkSMS(
          returning.map(m => m.formattedPhone),
          messagePartsNone.fullMessage,
          { mediaUrl: smsMediaUrl, logContext: { announcementId: announcement.id, channel: 'members', segment: 'returning' } }
        );
        totalSuccess += resultNone.success;
        totalFailed += resultNone.failed;
      }

      await SMSNotificationService.recordAnnouncementSmsRecipients(
        recipientsToUse.map(m => ({ userId: m.id, chapterId: m.chapter_id, phoneNumber: m.formattedPhone })),
        messagePartsFull.fullMessage
      );

      console.log('✅ Announcement SMS sent:', {
        total: recipientsToUse.length, firstTime: firstTime.length, returning: returning.length,
        success: totalSuccess, failed: totalFailed, announcementId: announcement.id,
        mediaAttempted: Boolean(smsMediaUrl),
      });

      try {
        const logClient = createServerSupabaseClient();
        await logClient.from('sms_logs').insert({
          chapter_id: chapterId, sent_by: senderId,
          message: messagePartsFull.fullMessage, recipients_count: recipientsToUse.length,
          success_count: totalSuccess, failed_count: totalFailed, test_mode: false,
        });
      } catch (logError) {
        console.error('Failed to log SMS to database:', logError);
      }
    } catch (error) {
      console.error('❌ Announcement SMS failed:', {
        error: error instanceof Error ? error.message : String(error),
        announcementId: announcement.id,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  } catch (smsError) {
    console.error('❌ Error sending announcement SMS:', smsError);
  }
}

async function sendAlumniSms(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  announcement: AnnouncementRow,
  chapterId: string,
  senderId: string,
  smsMediaUrl: string | null,
) {
  try {
    const { data: alumni, error: alumniError } = await supabase
      .from('profiles')
      .select('id, phone, first_name, chapter_id, role, sms_consent')
      .eq('chapter_id', chapterId)
      .eq('role', 'alumni')
      .neq('is_developer', true)
      .not('phone', 'is', null)
      .neq('phone', '')
      .eq('sms_consent', true);

    if (alumniError || !alumni || alumni.length === 0) return;

    const validAlumni = alumni
      .map(alum => ({ ...alum, formattedPhone: SMSService.formatPhoneNumber(alum.phone!) }))
      .filter(alum => SMSService.isValidPhoneNumber(alum.phone!));

    if (validAlumni.length === 0) return;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const link = `${baseUrl}/dashboard/announcements`;
    const headline = announcement.title.slice(0, 40);
    const detail = announcement.content.slice(0, 60).replace(/\s+/g, ' ').trim();

    const receivedSetAlumni = await SMSNotificationService.getUserIdSetThatHaveReceivedSms(
      validAlumni.map(a => a.id)
    );
    const isSandboxAlumni = SMSService.isInSandboxMode();
    const recipientsToUseAlumni = isSandboxAlumni ? validAlumni.slice(0, 3) : validAlumni;
    const firstTimeAlumni = recipientsToUseAlumni.filter(a => !receivedSetAlumni.has(a.id));
    const returningAlumni = recipientsToUseAlumni.filter(a => receivedSetAlumni.has(a.id));

    const messagePartsFullAlumni = SMSMessageFormatter.formatShortMessage(
      headline, detail, 'Read more', link, { complianceLevel: 'full' }
    );
    const messagePartsNoneAlumni = SMSMessageFormatter.formatShortMessage(
      headline, detail, 'Read more', link, { complianceLevel: 'none' }
    );

    if (recipientsToUseAlumni.length === 0) return;

    try {
      let totalSuccessAlumni = 0;
      let totalFailedAlumni = 0;
      if (firstTimeAlumni.length > 0) {
        const resultFull = await SMSService.sendBulkSMS(
          firstTimeAlumni.map(a => a.formattedPhone),
          messagePartsFullAlumni.fullMessage,
          { mediaUrl: smsMediaUrl, logContext: { announcementId: announcement.id, channel: 'alumni', segment: 'first_time' } }
        );
        totalSuccessAlumni += resultFull.success;
        totalFailedAlumni += resultFull.failed;
      }
      if (returningAlumni.length > 0) {
        const resultNone = await SMSService.sendBulkSMS(
          returningAlumni.map(a => a.formattedPhone),
          messagePartsNoneAlumni.fullMessage,
          { mediaUrl: smsMediaUrl, logContext: { announcementId: announcement.id, channel: 'alumni', segment: 'returning' } }
        );
        totalSuccessAlumni += resultNone.success;
        totalFailedAlumni += resultNone.failed;
      }

      await SMSNotificationService.recordAnnouncementSmsRecipients(
        recipientsToUseAlumni.map(a => ({ userId: a.id, chapterId: a.chapter_id, phoneNumber: a.formattedPhone })),
        messagePartsFullAlumni.fullMessage
      );

      console.log('✅ Alumni announcement SMS sent:', {
        total: recipientsToUseAlumni.length, firstTime: firstTimeAlumni.length, returning: returningAlumni.length,
        success: totalSuccessAlumni, failed: totalFailedAlumni, announcementId: announcement.id,
        mediaAttempted: Boolean(smsMediaUrl),
      });

      try {
        const logClient = createServerSupabaseClient();
        await logClient.from('sms_logs').insert({
          chapter_id: chapterId, sent_by: senderId,
          message: messagePartsFullAlumni.fullMessage, recipients_count: recipientsToUseAlumni.length,
          success_count: totalSuccessAlumni, failed_count: totalFailedAlumni, test_mode: false,
        });
      } catch (logError) {
        console.error('Failed to log alumni SMS to database:', logError);
      }
    } catch (error) {
      console.error('❌ Alumni announcement SMS failed:', {
        error: error instanceof Error ? error.message : String(error),
        announcementId: announcement.id,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  } catch (smsError) {
    console.error('❌ Error sending alumni announcement SMS:', smsError);
  }
}
