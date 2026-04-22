import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertAuthenticatedChapterReadAccess } from '@/lib/api/chapterScopedAccess';
import { getHiddenUserIdsForViewer, supabaseInList } from '@/lib/services/userBlockService';

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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, is_developer, signup_channel')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const access = await assertAuthenticatedChapterReadAccess(
      supabase,
      user.id,
      {
        chapter_id: profile.chapter_id,
        signup_channel: profile.signup_channel,
        is_developer: profile.is_developer,
      },
      chapterId
    );
    if (!access.ok) {
      return access.response;
    }

    const hiddenUserIds = await getHiddenUserIdsForViewer(supabase, user.id);

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
      let q = supabase
        .from('profiles')
        .select(selectCols)
        .eq('chapter_id', chapterId)
        .not('username', 'is', null)
        .neq('id', user.id)
        .order('full_name', { ascending: true, nullsFirst: false })
        .limit(DEFAULT_LIMIT);
      if (hiddenUserIds.length > 0) {
        q = q.not('id', 'in', supabaseInList(hiddenUserIds));
      }
      const result = await q;
      users = result.data;
      searchError = result.error;
    } else {
      const wildcardQuery = `%${query}%`;
      let q = supabase
        .from('profiles')
        .select(selectCols)
        .eq('chapter_id', chapterId)
        .not('username', 'is', null)
        .or(`username.ilike.${wildcardQuery},full_name.ilike.${wildcardQuery}`)
        .limit(DEFAULT_LIMIT);
      if (hiddenUserIds.length > 0) {
        q = q.not('id', 'in', supabaseInList(hiddenUserIds));
      }
      const result = await q;
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
