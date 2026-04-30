import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { EXECUTIVE_ROLES } from '@/lib/permissions';
import {
  createChapterCheckInQrPayload,
  serializeChapterCheckInQrPayload,
} from '@/lib/checkInQrToken';
import {
  createEventCheckInUrlPayload,
  serializeEventCheckInUrlToken,
} from '@/lib/eventCheckInUrlToken';
import type { EventCheckInQrResponse } from '@/types/events';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAppBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (!error && user) return { user };
  }
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { user };
}

/**
 * Exec-only: chapter JSON QR for in-app scan + absolute https check-in URL for native camera.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const secret = process.env.CHECK_IN_QR_SECRET;
    if (!secret || secret.length < 16) {
      console.error('CHECK_IN_QR_SECRET missing or too short');
      return NextResponse.json(
        { error: 'Check-in QR is not configured' },
        { status: 503 }
      );
    }

    const baseUrl = getAppBaseUrl();
    if (!baseUrl) {
      console.error('NEXT_PUBLIC_APP_URL is not set');
      return NextResponse.json(
        { error: 'App URL is not configured for check-in links' },
        { status: 503 }
      );
    }

    const { id: eventId } = await params;
    if (!eventId?.trim()) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user } = auth;

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await serviceSupabase
      .from('profiles')
      .select('id, role, chapter_id, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: event, error: eventError } = await serviceSupabase
      .from('events')
      .select('id, chapter_id, status')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.status !== 'published') {
      return NextResponse.json(
        { error: 'Event is not published' },
        { status: 400 }
      );
    }

    const eventChapterId = event.chapter_id as string;
    const sameChapter = profile.chapter_id === eventChapterId;
    const isChapterAdmin = profile.role === 'admin' && sameChapter;
    const isChapterExec =
      sameChapter &&
      profile.chapter_role != null &&
      EXECUTIVE_ROLES.includes(
        profile.chapter_role as (typeof EXECUTIVE_ROLES)[number]
      );
    const isExec = isChapterAdmin || isChapterExec;

    if (!isExec) {
      return NextResponse.json(
        { error: 'Only chapter executives can view the check-in QR' },
        { status: 403 }
      );
    }

    const chapterId = event.chapter_id as string;

    const chapterPayload = createChapterCheckInQrPayload(chapterId, secret);
    const qr_value = serializeChapterCheckInQrPayload(chapterPayload);

    const urlPayload = createEventCheckInUrlPayload(eventId, chapterId, secret);
    const t = serializeEventCheckInUrlToken(urlPayload);
    const check_in_url = `${baseUrl}/check-in?event=${encodeURIComponent(eventId)}&t=${encodeURIComponent(t)}`;

    return NextResponse.json<EventCheckInQrResponse>({
      data: {
        qr_value,
        check_in_url,
        event_id: eventId,
        chapter_id: chapterId,
        issued_at: urlPayload.i,
      },
    });
  } catch (error) {
    console.error('Event check-in QR API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
