import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { EXECUTIVE_ROLES } from '@/lib/permissions';
import type { AttendanceListResponse, AttendanceWithProfile } from '@/types/events';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
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
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { user };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;

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
      .select('id, chapter_id')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventChapterId = event.chapter_id as string;
    const sameChapter = profile.chapter_id === eventChapterId;
    const isChapterAdmin = profile.role === 'admin' && sameChapter;
    const isChapterExec =
      sameChapter &&
      !!profile.chapter_role &&
      EXECUTIVE_ROLES.includes(profile.chapter_role as (typeof EXECUTIVE_ROLES)[number]);
    const isExec = isChapterAdmin || isChapterExec;

    if (!isExec) {
      return NextResponse.json(
        { error: 'Only chapter exec can view attendance' },
        { status: 403 }
      );
    }

    const { data: rows, error: attError } = await serviceSupabase
      .from('event_attendance')
      .select('id, event_id, user_id, checked_in_at')
      .eq('event_id', eventId)
      .order('checked_in_at', { ascending: true });

    if (attError) {
      console.error('Error fetching attendance:', attError);
      return NextResponse.json(
        { error: 'Failed to fetch attendance' },
        { status: 500 }
      );
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json<AttendanceListResponse>({
        data: { attendance: [] },
      });
    }

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles, error: profilesError } = await serviceSupabase
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .in('id', userIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return NextResponse.json(
        { error: 'Failed to fetch attendee profiles' },
        { status: 500 }
      );
    }

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
    const attendance: AttendanceWithProfile[] = rows.map((r) => {
      const p = profileMap.get(r.user_id);
      return {
        id: r.id,
        event_id: r.event_id,
        user_id: r.user_id,
        checked_in_at: r.checked_in_at,
        first_name: p?.first_name ?? null,
        last_name: p?.last_name ?? null,
        avatar_url: p?.avatar_url ?? null,
      };
    });

    return NextResponse.json<AttendanceListResponse>({
      data: { attendance },
    });
  } catch (error) {
    console.error('Attendance API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
