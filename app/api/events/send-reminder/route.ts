import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EmailService } from '@/lib/services/emailService';
import { canSendEmailNotification } from '@/lib/utils/checkEmailPreferences';
import { buildPushPayload } from '@/lib/services/notificationPushPayload';
import { sendPushToUser } from '@/lib/services/oneSignalPushService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  // Event reminder API called
  
  try {
    const { eventId, chapterId } = await request.json();

    if (!eventId || !chapterId) {
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
      return NextResponse.json({ 
        error: 'Event not found' 
      }, { status: 404 });
    }

    const notifyActiveMembers = event.visible_to_active_members ?? true;

    // Get all chapter members (exclude developers) — only when event is visible to active members
    let allMembers: Array<{
      id: string;
      email: string | null;
      first_name: string | null;
      chapter_id: string;
      role: string;
    }> = [];

    if (notifyActiveMembers) {
      const { data, error: membersError } = await supabase
        .from('profiles')
        .select('id, email, first_name, chapter_id, role')
        .eq('chapter_id', chapterId)
        .in('role', ['active_member', 'admin'])
        .neq('is_developer', true) // Exclude developer/ghost accounts from notifications
        .not('email', 'is', null);

      if (membersError || !data) {
        console.error('Error fetching chapter members:', membersError);
        return NextResponse.json({ 
          error: 'Failed to fetch chapter members' 
        }, { status: 500 });
      }
      allMembers = data;
    }


    // Get users who have RSVP'd
    const { data: rsvps, error: rsvpError } = await supabase
      .from('event_rsvps')
      .select('user_id')
      .eq('event_id', eventId);

    if (rsvpError) {
      console.error('Error fetching RSVPs:', rsvpError);
      return NextResponse.json({ 
        error: 'Failed to fetch RSVPs' 
      }, { status: 500 });
    }

    // Filter out users who have already RSVP'd
    const rsvpUserIds = new Set(rsvps?.map(r => r.user_id) || []);
    const membersWithoutRsvp = allMembers.filter(member => 
      !rsvpUserIds.has(member.id)
    );


    if (membersWithoutRsvp.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All members have already RSVP\'d',
        emailResult: { totalRecipients: 0, successful: 0, failed: 0 }
      });
    }

    // Get chapter name
    const { data: chapter } = await supabase
      .from('chapters')
      .select('name')
      .eq('id', chapterId)
      .single();

    // Filter by email preferences (email_enabled AND event_reminder_notifications)
    const allowedMembers = await Promise.all(
      membersWithoutRsvp.map(async (member) => {
        try {
          const allowed = await canSendEmailNotification(member.id as string, 'event_reminder');
          return allowed ? member : null;
        } catch {
          return null;
        }
      })
    );

    const allowedList = allowedMembers
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    const recipients = allowedList
      .filter((member) => Boolean(member.email))
      .map((member) => ({
        email: member.email as string,
        firstName: member.first_name || 'Member',
        chapterName: chapter?.name || 'Your Chapter',
      }));

    let startAtRelative = 'Time TBD';
    if (event.start_time) {
      const startDate = new Date(event.start_time);
      const now = new Date();
      const diffMs = startDate.getTime() - now.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays === 0) {
        if (diffHours <= 0) {
          startAtRelative = 'now';
        } else if (diffHours === 1) {
          startAtRelative = 'in 1 hour';
        } else {
          startAtRelative = `in ${diffHours} hours`;
        }
      } else if (diffDays === 1) {
        startAtRelative = 'tomorrow';
      } else {
        startAtRelative = `in ${diffDays} days`;
      }
    }



    const emailResult = await EmailService.sendEventReminderToChapter(recipients, {
      eventTitle: event.title,
      eventDescription: event.description,
      eventLocation: event.location,
      eventStartTime: event.start_time,
      eventEndTime: event.end_time,
      eventId: event.id,
      startAtRelative
    });

    // Push: notify each recipient of event reminder
    const pushPayload = buildPushPayload('event_reminder', {
      eventId: event.id,
      eventSlug: event.slug ?? null,
      eventTitle: event.title,
      startAtRelative,
    });
    for (const member of allowedList) {
      sendPushToUser(member.id, pushPayload).catch(pushErr => {
        console.error('Failed to send event reminder push to', member.id, pushErr);
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Event reminder emails sent successfully',
      emailResult: {
        totalRecipients: recipients.length,
        successful: emailResult.successful,
        failed: emailResult.failed
      }
    });

  } catch (error) {
    console.error('Error in send event reminder API:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
