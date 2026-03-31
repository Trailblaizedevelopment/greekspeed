import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import {
  getManagedChapterIds,
  getChapterHealthRows,
} from '@/lib/services/governanceService';

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
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.role !== 'governance') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const chapterIds = await getManagedChapterIds(supabase, user.id);
    const rows = await getChapterHealthRows(supabase, chapterIds);

    return NextResponse.json({ rows });
  } catch (error) {
    console.error('chapter-health API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
