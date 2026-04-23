import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { EXECUTIVE_ROLES } from '@/lib/permissions';
import {
  createChapterCheckInQrPayload,
  serializeChapterCheckInQrPayload,
} from '@/lib/checkInQrToken';
import type { ChapterCheckInQrResponse } from '@/types/events';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
 * Exec-only: returns a signed JSON string for chapter check-in QR (in-app scan flow).
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

    const { id: chapterId } = await params;
    if (!chapterId?.trim()) {
      return NextResponse.json({ error: 'Invalid chapter' }, { status: 400 });
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

    if (profile.chapter_id !== chapterId) {
      return NextResponse.json(
        { error: 'You do not have access to this chapter' },
        { status: 403 }
      );
    }

    const isExec =
      profile.role === 'admin' ||
      (profile.chapter_role != null &&
        EXECUTIVE_ROLES.includes(
          profile.chapter_role as (typeof EXECUTIVE_ROLES)[number]
        ));
    if (!isExec) {
      return NextResponse.json(
        { error: 'Only chapter executives can view the check-in QR' },
        { status: 403 }
      );
    }

    const { data: chapter, error: chapterError } = await serviceSupabase
      .from('spaces')
      .select('id')
      .eq('id', chapterId)
      .maybeSingle();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    const payload = createChapterCheckInQrPayload(chapterId, secret);
    const qr_value = serializeChapterCheckInQrPayload(payload);

    return NextResponse.json<ChapterCheckInQrResponse>({
      data: {
        qr_value,
        chapter_id: chapterId,
        issued_at: payload.i,
      },
    });
  } catch (error) {
    console.error('Chapter check-in QR API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
