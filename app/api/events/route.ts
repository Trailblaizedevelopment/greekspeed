import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { compareEventsByStartAsc, normalizeEventTimeField } from '@/lib/utils/eventScheduleDisplay';
import { authenticateApiRequest } from '@/lib/api/authenticateApiRequest';
import { assertAuthenticatedChapterReadAccess } from '@/lib/api/chapterScopedAccess';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');
    const chapterId = searchParams.get('chapter_id');
    const userId = searchParams.get('user_id'); // Optional: include current user's RSVP status

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID is required' }, { status: 400 });
    }

    // TRA-584: Logged-in users must pass the same chapter access rules as the feed (marketing pending → 403).
    // Unauthenticated callers keep prior behavior (e.g. public profile upcoming events).
    const auth = await authenticateApiRequest(request);
    if (auth) {
      const { data: accessProfile, error: accessProfileError } = await auth.supabase
        .from('profiles')
        .select('chapter_id, signup_channel, is_developer')
        .eq('id', auth.user.id)
        .single();

      if (accessProfileError || !accessProfile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }

      const access = await assertAuthenticatedChapterReadAccess(
        auth.supabase,
        auth.user.id,
        {
          chapter_id: accessProfile.chapter_id,
          signup_channel: accessProfile.signup_channel,
          is_developer: accessProfile.is_developer,
        },
        chapterId
      );
      if (!access.ok) {
        return access.response;
      }
    }

    let query = supabase
      .from('events')
      .select(`
        *,
        event_rsvps (
          id,
          user_id,
          status
        )
      `)
      .eq('chapter_id', chapterId)
      .is('archived_at', null);

    if (scope === 'upcoming') {
      const now = new Date().toISOString();
      // Published events: TBD-time (null start), not yet started, or currently in progress
      query = query
        .eq('status', 'published')
        .or(
          `and(start_time.is.null,or(end_time.is.null,end_time.gte.${now})),start_time.gte.${now},and(start_time.lte.${now},end_time.gte.${now})`
        )
        .order('start_time', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data: events, error } = await query;

    if (error) {
      console.error('Error fetching events:', error);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    // Transform data to include RSVP counts + optional per-user RSVP status.
    // This eliminates the N+1 pattern where the client had to call
    // /api/events/:id/rsvp for EVERY event individually.
    const eventsWithCounts = events?.map(event => {
      const rsvps = event.event_rsvps || [];

      // Find the current user's RSVP status (if user_id was provided)
      let user_rsvp_status: string | null = null;
      if (userId) {
        const userRsvp = rsvps.find((r: any) => r.user_id === userId);
        user_rsvp_status = userRsvp?.status ?? null;
      }

      return {
        ...event,
        attendee_count: rsvps.filter((r: any) => r.status === 'attending').length,
        maybe_count: rsvps.filter((r: any) => r.status === 'maybe').length,
        not_attending_count: rsvps.filter((r: any) => r.status === 'not_attending').length,
        // Include per-user RSVP status when user_id is provided
        ...(userId ? { user_rsvp_status } : {}),
        event_rsvps: undefined // Remove the raw RSVP data
      };
    }) || [];

    if (scope === 'upcoming') {
      eventsWithCounts.sort(compareEventsByStartAsc);
    }

    return NextResponse.json(eventsWithCounts, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('Error in events API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const eventData = await request.json();

    if (!eventData.title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (!eventData.chapter_id) {
      return NextResponse.json({ error: 'chapter_id is required' }, { status: 400 });
    }

    const startTime = normalizeEventTimeField(eventData.start_time);
    const endTime = normalizeEventTimeField(eventData.end_time);

    if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
    }

    // Extract send_sms and send_sms_to_alumni flags (they're not database columns, just notification flags)
    const { send_sms, send_sms_to_alumni, ...dbEventData } = eventData;

    // Create the event
    const insertData = {
      ...dbEventData,
      start_time: startTime,
      end_time: endTime,
      status: dbEventData.status || 'published',
      created_by: dbEventData.created_by || 'system', // Will be updated when we add proper auth
      updated_by: dbEventData.updated_by || 'system'
    };

    const { data: newEvent, error } = await supabase
      .from('events')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Error creating event:', error);
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }

    // NEW: Send email notifications if event is published
    if (newEvent.status === 'published') {
      
      try {
        const baseUrl = process.env.NODE_ENV === 'development' 
        ? 'http://localhost:3000' 
        : process.env.NEXT_PUBLIC_APP_URL || 'https://www.trailblaize.net';
        const emailUrl = `${baseUrl}/api/events/send-email`;
        
        // Trigger email sending asynchronously - pass send_sms and send_sms_to_alumni flags
        const emailResponse = await fetch(emailUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            eventId: newEvent.id,
            chapterId: newEvent.chapter_id,
            send_sms: send_sms || false,
            send_sms_to_alumni: send_sms_to_alumni || false
          })
        });

        // Email API response received

        if (emailResponse.ok) {
          const emailResult = await emailResponse.json();
          // Event notification emails sent successfully
        } else {
          const errorText = await emailResponse.text();
          console.error('Failed to send event notification emails');
          console.error('Response status:', emailResponse.status);
          console.error('Response text:', errorText);
        }
      } catch (emailError) {
        console.error('Error sending event notification emails:', emailError);
        console.error('Error details:', {
          message: emailError instanceof Error ? emailError.message : 'Unknown error',
          stack: emailError instanceof Error ? emailError.stack : 'No stack trace'
        });
        // Don't fail the event creation if email fails
      }
    } else {
      // Event status is not published, skipping email notifications
    }

    return NextResponse.json({ 
      success: true, 
      event: newEvent,
      message: 'Event created successfully' 
    });

  } catch (error) {
    console.error('Error in create event API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
