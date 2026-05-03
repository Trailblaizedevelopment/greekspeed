import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { listChapterDonationBrowse } from '@/lib/services/donations/chapterDonationBrowseService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    const { id: trailblaizeChapterId } = await params;
    const chapterId = trailblaizeChapterId.trim();
    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter id required' }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, is_developer, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const isDeveloper = profile.is_developer === true;
    const isOwnChapter = profile.chapter_id === chapterId;

    if (!isDeveloper && !isOwnChapter) {
      const managedIds = await getManagedChapterIds(supabase, user.id);
      if (!managedIds.length || !managedIds.includes(chapterId)) {
        return NextResponse.json(
          { error: 'Insufficient permissions to view another chapter' },
          { status: 403 }
        );
      }
    }

    const result = await listChapterDonationBrowse({
      supabase,
      userId: user.id,
      chapterId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: result.entries });
  } catch (e) {
    console.error('GET /api/chapters/[id]/donations/browse:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
