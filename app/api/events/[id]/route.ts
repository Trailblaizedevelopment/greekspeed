import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeEventTimeField } from '@/lib/utils/eventScheduleDisplay';
import { authenticateApiRequest } from '@/lib/api/authenticateApiRequest';
import { assertAuthenticatedChapterReadAccess } from '@/lib/api/chapterScopedAccess';
import { assertEventVisibleToViewer, validateAudienceSelection } from '@/lib/utils/eventAudienceVisibility';
import { buildEventAudienceViewerForChapter } from '@/lib/api/buildEventAudienceViewer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data: event, error } = await supabase
      .from('events')
      .select(`
        *,
        event_rsvps (
          id,
          user_id,
          status,
          responded_at
        )
      `)
      .eq('id', id)
      .single();

    if (error || !event) {
      console.error('Error fetching event:', error);
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const auth = await authenticateApiRequest(request);
    if (auth) {
      const { data: accessProfile, error: accessProfileError } = await auth.supabase
        .from('profiles')
        .select('chapter_id, signup_channel, is_developer, role, chapter_role')
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
        event.chapter_id as string
      );
      if (!access.ok) {
        return access.response;
      }

      const viewer = await buildEventAudienceViewerForChapter(
        auth.supabase,
        auth.user.id,
        event.chapter_id as string,
        {
          chapter_id: accessProfile.chapter_id,
          role: accessProfile.role,
          chapter_role: accessProfile.chapter_role,
          is_developer: accessProfile.is_developer,
        }
      );
      if (!assertEventVisibleToViewer(event, viewer, event.chapter_id as string)) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
    } else {
      if (
        !assertEventVisibleToViewer(event, null, event.chapter_id as string)
      ) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
    }

    return NextResponse.json(event);
  } catch (error) {
    console.error('Error in event detail API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updateData = await request.json();

    const { data: existingEvent, error: existingError } = await supabase
      .from('events')
      .select('visible_to_active_members, visible_to_alumni')
      .eq('id', id)
      .single();

    if (existingError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const startPatch =
      'start_time' in updateData ? normalizeEventTimeField(updateData.start_time) : undefined;
    const endPatch =
      'end_time' in updateData ? normalizeEventTimeField(updateData.end_time) : undefined;

    if (startPatch != null && endPatch != null) {
      if (new Date(endPatch) <= new Date(startPatch)) {
        return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
      }
    }

    // Filter out fields that shouldn't be updated directly (send_sms, send_sms_to_alumni are not DB columns)
    const { send_sms, send_sms_to_alumni, created_by, created_at, ...allowedUpdateData } = updateData;

    const merged: Record<string, unknown> = { ...allowedUpdateData };
    if ('start_time' in updateData) merged.start_time = startPatch;
    if ('end_time' in updateData) merged.end_time = endPatch;

    if (
      'visible_to_active_members' in updateData ||
      'visible_to_alumni' in updateData
    ) {
      const nextActive =
        'visible_to_active_members' in updateData
          ? Boolean(updateData.visible_to_active_members)
          : Boolean(existingEvent.visible_to_active_members);
      const nextAlumni =
        'visible_to_alumni' in updateData
          ? Boolean(updateData.visible_to_alumni)
          : Boolean(existingEvent.visible_to_alumni);
      const aud = validateAudienceSelection(nextActive, nextAlumni);
      if (!aud.ok) {
        return NextResponse.json({ error: aud.error }, { status: 400 });
      }
      merged.visible_to_active_members = nextActive;
      merged.visible_to_alumni = nextAlumni;
    } else {
      delete merged.visible_to_active_members;
      delete merged.visible_to_alumni;
    }

    // Update the event
    const { data: updatedEvent, error } = await supabase
      .from('events')
      .update({
        ...merged,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating event:', error);
      return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      event: updatedEvent,
      message: 'Event updated successfully' 
    });

  } catch (error) {
    console.error('Error in update event API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Archive (soft delete) instead of hard delete - preserves budget, attendance, RSVP history
    const { error } = await supabase
      .from('events')
      .update({
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error archiving event:', error);
      return NextResponse.json({ error: 'Failed to archive event' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Event archived successfully' 
    });

  } catch (error) {
    console.error('Error in archive event API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
