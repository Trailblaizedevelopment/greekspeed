import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EmailService } from '@/lib/services/emailService';
import { SMSService } from '@/lib/services/sms/smsServiceTelnyx';
import { SMSNotificationService } from '@/lib/services/sms/smsNotificationService';
import { canSendEmailNotification } from '@/lib/utils/checkEmailPreferences';
import { buildPushPayload } from '@/lib/services/notificationPushPayload';
import { sendPushToUser } from '@/lib/services/oneSignalPushService';
import { generateEventLink } from '@/lib/utils/eventLinkUtils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configure function timeout for Vercel (60 seconds for Pro plan)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Event email API called
  
  try {
    const requestBody = await request.json();
    
    const { eventId, chapterId, send_sms, send_sms_to_alumni } = requestBody;

    if (!eventId || !chapterId) {
      console.error('Missing required parameters:', { eventId, chapterId });
      return NextResponse.json({ 
        error: 'Event ID and Chapter ID are required' 
      }, { status: 400 });
    }


    // Fetch the event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .eq('chapter_id', chapterId)
      .single();

    if (eventError || !event) {
      console.error('Error fetching event:', eventError);
      console.error('Event not found for:', { eventId, chapterId });
      return NextResponse.json({ 
        error: 'Event not found' 
      }, { status: 404 });
    }

    const notifyActiveMembers = event.visible_to_active_members ?? true;
    const notifyAlumniAudience = event.visible_to_alumni ?? true;

    // Fetch chapter members (active members and admins only, exclude developers)
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
        .neq('is_developer', true) // Exclude developer/ghost accounts from notifications
        .not('email', 'is', null);

      if (membersError) {
        console.error('Error fetching chapter members:', membersError);
        return NextResponse.json({ 
          error: 'Failed to fetch chapter members' 
        }, { status: 500 });
      }
      members = data ?? [];
    } else {
      members = [];
    }

    if (members.length === 0 && notifyActiveMembers) {
      console.error('No active members found for chapter:', chapterId);
      return NextResponse.json({ 
        error: 'No active members found for this chapter' 
      }, { status: 404 });
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
        return NextResponse.json(
          { error: 'Failed to fetch chapter alumni' },
          { status: 500 }
        );
      }
      alumniMembers = (alumniData ?? []) as EventEmailProfile[];
    }

    // Get chapter name
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('name')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      console.error('Error fetching chapter:', chapterError);
      return NextResponse.json({ 
        error: 'Chapter not found' 
      }, { status: 404 });
    }


    // Prepare recipients with email preference checks (email_enabled AND event_notifications)
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

    const allowedList = allowedMembers
      .filter((m): m is NonNullable<typeof m> => Boolean(m));

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



    // Send event notification emails
    const emailResult = await EmailService.sendEventToChapter(recipients, {
      eventTitle: event.title,
      eventDescription: event.description,
      eventLocation: event.location,
      eventStartTime: event.start_time,
      eventEndTime: event.end_time,
      eventId: event.id
    });

    // Push: notify each recipient of new event
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

    // Send SMS notifications only if send_sms is true (parallel to email, don't block if SMS fails)
    if (send_sms === true && notifyActiveMembers) {
      try {
        console.log('📱 Starting SMS notification process for event:', {
          eventId: event.id,
          eventTitle: event.title,
          chapterId: chapterId
        });

        // Get chapter members with phone numbers and SMS consent (exclude developers)
        const { data: smsMembers, error: smsMembersError } = await supabase
          .from('profiles')
          .select(`
            id,
            phone,
            first_name,
            chapter_id,
            role,
            sms_consent  
          `)
          .eq('chapter_id', chapterId)
          .in('role', ['active_member', 'admin'])
          .neq('is_developer', true) // Exclude developer/ghost accounts from notifications
          .not('phone', 'is', null)
          .neq('phone', '')
          .eq('sms_consent', true);

        if (smsMembersError) {
          console.error('❌ Error fetching SMS members:', smsMembersError);
        } else if (!smsMembers || smsMembers.length === 0) {
          console.log('ℹ️ No SMS-eligible members found:', {
            chapterId,
            reason: 'No members with phone numbers and SMS consent'
          });
        } else {
          console.log('📋 Found SMS-eligible members:', {
            total: smsMembers.length,
            members: smsMembers.map(m => ({
              id: m.id,
              firstName: m.first_name,
              phone: m.phone,
              hasConsent: m.sms_consent
            }))
          });

          // Format and validate phone numbers
          const validSMSMembers = smsMembers
            .map(member => ({
              ...member,
              formattedPhone: SMSService.formatPhoneNumber(member.phone!),
            }))
            .filter(member => SMSService.isValidPhoneNumber(member.phone!));

          console.log('✅ Validated SMS members:', {
            total: validSMSMembers.length,
            valid: validSMSMembers.map(m => ({
              id: m.id,
              firstName: m.first_name,
              original: m.phone,
              formatted: m.formattedPhone
            })),
            invalid: smsMembers.length - validSMSMembers.length
          });

          if (validSMSMembers.length > 0) {
            // Format event date for SMS message (untimed events → "Time TBD")
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

            // Determine if we should use test mode (same logic as email)
            const isSandbox = SMSService.isInSandboxMode();
            const membersToNotify = isSandbox ? validSMSMembers.slice(0, 3) : validSMSMembers;

            console.log('🚀 Preparing to send SMS:', {
              totalEligible: validSMSMembers.length,
              willNotify: membersToNotify.length,
              isSandbox: isSandbox,
              eventDate: formattedDate,
              recipients: membersToNotify.map(m => ({
                name: m.first_name,
                phone: m.formattedPhone
              }))
            });

            // Import SMSNotificationService
            const { SMSNotificationService } = await import('@/lib/services/sms/smsNotificationService');

            const eventLink = generateEventLink(event.id, event.slug ?? null, { ref: 'sms' });
            Promise.all(
              membersToNotify.map(member =>
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
            )
              .then(results => {
                const successCount = results.filter(r => r === true).length;
                const failedCount = results.length - successCount;
                console.log('✅ Event SMS notifications completed:', {
                  eventId: event.id,
                  eventTitle: event.title,
                  total: membersToNotify.length,
                  success: successCount,
                  failed: failedCount,
                  successRate: `${((successCount / membersToNotify.length) * 100).toFixed(1)}%`,
                  recipients: membersToNotify.map((m, i) => ({
                    name: m.first_name,
                    phone: m.formattedPhone,
                    status: results[i] ? 'success' : 'failed'
                  }))
                });
              })
              .catch(error => {
                console.error('❌ Event SMS notifications failed:', {
                  eventId: event.id,
                  error: error.message,
                  stack: error.stack
                });
                // Don't throw - SMS failure shouldn't block email sending
              });
          }
        }
      } catch (smsError) {
        console.error('❌ Error in SMS notification process:', {
          eventId: event.id,
          error: smsError instanceof Error ? smsError.message : 'Unknown error',
          stack: smsError instanceof Error ? smsError.stack : undefined
        });
        // Don't fail the request if SMS fails
      }
    } else {
      console.log('ℹ️ SMS notifications skipped (send_sms = false)');
    }

    // Send SMS notifications to alumni only if send_sms_to_alumni is true
    if (send_sms_to_alumni === true && notifyAlumniAudience) {
      try {
        console.log('📱 Starting SMS notification process for event (alumni):', {
          eventId: event.id,
          eventTitle: event.title,
          chapterId: chapterId
        });

        // Get chapter alumni with phone numbers and SMS consent
          const { data: alumni, error: alumniError } = await supabase
            .from('profiles')
            .select(`
              id,
              phone,
              first_name,
              chapter_id,
              role,
              sms_consent
            `)
            .eq('chapter_id', chapterId)
            .eq('role', 'alumni')
            .neq('is_developer', true) // Exclude developer/ghost accounts from notifications
            .not('phone', 'is', null)
            .neq('phone', '')
            .eq('sms_consent', true);

        if (alumniError) {
          console.error('❌ Error fetching alumni for SMS:', alumniError);
        } else if (!alumni || alumni.length === 0) {
          console.log('ℹ️ No SMS-eligible alumni found:', {
            chapterId,
            reason: 'No alumni with phone numbers and SMS consent'
          });
        } else {
          console.log('📋 Found SMS-eligible alumni:', {
            total: alumni.length,
            alumni: alumni.map(a => ({
              id: a.id,
              firstName: a.first_name,
              phone: a.phone,
              hasConsent: a.sms_consent
            }))
          });

          // Format and validate phone numbers
          const validAlumni = alumni
            .map(alum => ({
              ...alum,
              formattedPhone: SMSService.formatPhoneNumber(alum.phone!),
            }))
            .filter(alum => SMSService.isValidPhoneNumber(alum.phone!));

          console.log('✅ Validated alumni for SMS:', {
            total: validAlumni.length,
            valid: validAlumni.map(a => ({
              id: a.id,
              firstName: a.first_name,
              original: a.phone,
              formatted: a.formattedPhone
            })),
            invalid: alumni.length - validAlumni.length
          });

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

            // Determine if we should use test mode
            const isSandbox = SMSService.isInSandboxMode();
            const alumniToNotify = isSandbox ? validAlumni.slice(0, 3) : validAlumni;

            console.log('🚀 Preparing to send SMS to alumni:', {
              totalEligible: validAlumni.length,
              willNotify: alumniToNotify.length,
              isSandbox: isSandbox,
              eventDate: formattedDate,
              recipients: alumniToNotify.map(a => ({
                name: a.first_name,
                phone: a.formattedPhone
              }))
            });

            const eventLink = generateEventLink(event.id, event.slug ?? null, { ref: 'sms' });
            Promise.all(
              alumniToNotify.map(alum =>
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
            )
              .then(results => {
                const successCount = results.filter(r => r === true).length;
                const failedCount = results.length - successCount;
                console.log('✅ Event SMS notifications to alumni completed:', {
                  eventId: event.id,
                  eventTitle: event.title,
                  total: alumniToNotify.length,
                  success: successCount,
                  failed: failedCount,
                  successRate: `${((successCount / alumniToNotify.length) * 100).toFixed(1)}%`,
                  recipients: alumniToNotify.map((a, i) => ({
                    name: a.first_name,
                    phone: a.formattedPhone,
                    status: results[i] ? 'success' : 'failed'
                  }))
                });
              })
              .catch(error => {
                console.error('❌ Event SMS notifications to alumni failed:', {
                  eventId: event.id,
                  error: error.message,
                  stack: error.stack
                });
                // Don't throw - SMS failure shouldn't block email sending
              });
          }
        }
      } catch (smsError) {
        console.error('❌ Error in alumni SMS notification process:', {
          eventId: event.id,
          error: smsError instanceof Error ? smsError.message : 'Unknown error',
          stack: smsError instanceof Error ? smsError.stack : undefined
        });
        // Don't fail the request if SMS fails
      }
    } else {
      console.log('ℹ️ Alumni SMS notifications skipped (send_sms_to_alumni = false)');
    }


    // Update event metadata to track email sending
    const { error: updateError } = await supabase
      .from('events')
      .update({
        metadata: {
          email_sent: true,
          email_sent_at: new Date().toISOString(),
          email_recipients: recipients.length,
          email_successful: emailResult.successful,
          email_failed: emailResult.failed
        }
      })
      .eq('id', eventId);

    if (updateError) {
      console.error('Error updating event metadata:', updateError);
      // Don't fail the request, just log the error
    } else {
      // Event metadata updated successfully
    }

    const response = {
      success: true,
      message: 'Event notification emails sent successfully',
      emailResult: {
        totalRecipients: recipients.length,
        successful: emailResult.successful,
        failed: emailResult.failed
      }
    };


    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in send event email API:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
