import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/mentions/search?q=<query>&chapterId=<chapter_id>
 *
 * Returns chapter members whose username or full_name matches the query.
 * Used by the mention typeahead in the post/comment composers.
 * Scoped to the caller's chapter (or the explicitly passed chapterId for
 * governance/developer users who can view other chapters).
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') ?? '').trim().toLowerCase();
    const chapterId = searchParams.get('chapterId');

    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId is required' }, { status: 400 });
    }

    if (query.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('chapter_id, is_developer')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const isDeveloper = profile.is_developer === true;
    const isOwnChapter = profile.chapter_id === chapterId;

    if (!isDeveloper && !isOwnChapter) {
      const { getManagedChapterIds } = await import('@/lib/services/governanceService');
      const managedIds = await getManagedChapterIds(supabase, user.id);
      if (!managedIds.includes(chapterId)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const wildcardQuery = `%${query}%`;

    const { data: users, error: searchError } = await supabase
      .from('profiles')
      .select('id, username, full_name, first_name, last_name, avatar_url')
      .eq('chapter_id', chapterId)
      .not('username', 'is', null)
      .or(`username.ilike.${wildcardQuery},full_name.ilike.${wildcardQuery}`)
      .limit(10);

    if (searchError) {
      console.error('Mention search error:', searchError);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    return NextResponse.json({
      users: (users ?? []).map((u) => ({
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        first_name: u.first_name,
        last_name: u.last_name,
        avatar_url: u.avatar_url,
      })),
    });
  } catch (error) {
    console.error('Mention search API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
