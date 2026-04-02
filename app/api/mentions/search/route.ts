import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_LIMIT = 10;

/**
 * GET /api/mentions/search?q=<query>&chapterId=<chapter_id>
 *
 * - Empty `q`: up to 10 chapter members with usernames, ordered by full_name,
 *   excluding the current user (default picker after typing `@`).
 * - Non-empty `q`: filter by username / full_name (ilike), up to 10 rows.
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
    const rawQ = searchParams.get('q') ?? '';
    const query = rawQ.trim().toLowerCase();
    const chapterId = searchParams.get('chapterId');

    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId is required' }, { status: 400 });
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

    const selectCols = 'id, username, full_name, first_name, last_name, avatar_url';

    let users: Array<{
      id: string;
      username: string | null;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
    }> | null = null;
    let searchError: unknown = null;

    if (query.length === 0) {
      const result = await supabase
        .from('profiles')
        .select(selectCols)
        .eq('chapter_id', chapterId)
        .not('username', 'is', null)
        .neq('id', user.id)
        .order('full_name', { ascending: true, nullsFirst: false })
        .limit(DEFAULT_LIMIT);
      users = result.data;
      searchError = result.error;
    } else {
      const wildcardQuery = `%${query}%`;
      const result = await supabase
        .from('profiles')
        .select(selectCols)
        .eq('chapter_id', chapterId)
        .not('username', 'is', null)
        .or(`username.ilike.${wildcardQuery},full_name.ilike.${wildcardQuery}`)
        .limit(DEFAULT_LIMIT);
      users = result.data;
      searchError = result.error;
    }

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
