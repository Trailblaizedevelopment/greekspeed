import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { fetchPrimaryLogoUrlByChapterIds } from '@/lib/services/chapterBrandingBatchService';
import { getManagedChapterIds } from '@/lib/services/governanceService';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, chapter_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.role !== 'governance') {
      return NextResponse.json({ chapterIds: [], chapters: [] });
    }

    const chapterIds = await getManagedChapterIds(supabase, user.id);
    if (chapterIds.length === 0) {
      return NextResponse.json({ chapterIds: [], chapters: [] });
    }

    const { data: chapters, error: chaptersError } = await supabase
      .from('spaces')
      .select('id, name')
      .in('id', chapterIds);

    if (chaptersError) {
      return NextResponse.json({ chapterIds, chapters: [] });
    }

    const homeChapterId = profile.chapter_id ?? null;
    const list = (chapters ?? []).map((c) => ({ id: c.id, name: c.name }));
    // User's active (home) chapter first, then the rest
    const sorted =
      homeChapterId != null
        ? [
            ...list.filter((c) => c.id === homeChapterId),
            ...list.filter((c) => c.id !== homeChapterId),
          ]
        : list;

    const logoMap = await fetchPrimaryLogoUrlByChapterIds(supabase, chapterIds);
    const chaptersWithLogos = sorted.map((c) => ({
      ...c,
      primary_logo_url: logoMap.get(c.id) ?? null,
    }));

    return NextResponse.json({
      chapterIds,
      chapters: chaptersWithLogos,
    });
  } catch (error) {
    console.error('governance-chapters API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
