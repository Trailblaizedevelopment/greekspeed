import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateApiRequest } from '@/lib/api/authenticateApiRequest';
import { canManageChapterForContext, type ProfileForPermission } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { dispatchChapterEventPublishedNotifications } from '@/lib/services/chapterEventNotificationDispatch';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const maxDuration = 60;

function readBooleanFromMeta(meta: unknown, key: string): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  const v = (meta as Record<string, unknown>)[key];
  return v === true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;

    const auth = await authenticateApiRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: profileRow, error: profileError } = await auth.supabase
      .from('profiles')
      .select('role, chapter_id, chapter_role')
      .eq('id', auth.user.id)
      .single();

    if (profileError || !profileRow) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile: ProfileForPermission = {
      role: profileRow.role ?? null,
      chapter_id: profileRow.chapter_id ?? null,
      chapter_role: profileRow.chapter_role ?? null,
    };

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(auth.supabase, auth.user.id);
    }

    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id, chapter_id, status, metadata')
      .eq('id', eventId)
      .single();

    if (eventError || !eventRow) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (!canManageChapterForContext(profile, eventRow.chapter_id, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    if (eventRow.status !== 'published') {
      return NextResponse.json(
        { error: 'Only published events can resend chapter notifications' },
        { status: 400 }
      );
    }

    let send_sms = readBooleanFromMeta(eventRow.metadata, 'last_publish_send_sms');
    let send_sms_to_alumni = readBooleanFromMeta(eventRow.metadata, 'last_publish_send_sms_to_alumni');

    try {
      const body = (await request.json()) as {
        send_sms?: unknown;
        send_sms_to_alumni?: unknown;
      };
      if (typeof body?.send_sms === 'boolean') {
        send_sms = body.send_sms;
      }
      if (typeof body?.send_sms_to_alumni === 'boolean') {
        send_sms_to_alumni = body.send_sms_to_alumni;
      }
    } catch {
      // No JSON body — keep metadata defaults
    }

    const result = await dispatchChapterEventPublishedNotifications(supabase, {
      eventId: eventRow.id,
      chapterId: eventRow.chapter_id,
      send_sms,
      send_sms_to_alumni,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: 'Event notifications resent successfully',
      emailResult: {
        totalRecipients: result.totalRecipients,
        successful: result.successful,
        failed: result.failed,
      },
    });
  } catch (error) {
    console.error('resend-notifications API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
