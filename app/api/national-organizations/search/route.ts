import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { postgrestIlikeQuotedPattern } from '@/lib/api/developerChapterSpacePayload';

const MIN_Q_LEN = 2;
const MAX_LIMIT = 50;

export type NationalOrgSearchRow = {
  id: string;
  name: string;
  short_name: string | null;
  type: string | null;
};

/**
 * GET /api/national-organizations/search?q=&limit=
 * Public ILIKE search over `national_organizations` (name, short_name).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get('limit') || '30', 10) || 30),
  );

  if (q.length < MIN_Q_LEN) {
    return NextResponse.json({ nationalOrganizations: [] as NationalOrgSearchRow[] });
  }

  const supabase = createServerSupabaseClient();
  let query = supabase
    .from('national_organizations')
    .select('id,name,short_name,type')
    .order('name', { ascending: true })
    .limit(limit);

  const tokenPattern = postgrestIlikeQuotedPattern(q);
  if (tokenPattern) {
    query = query.or(`name.ilike.${tokenPattern},short_name.ilike.${tokenPattern}`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('national-organizations search:', error);
    return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 });
  }

  return NextResponse.json({ nationalOrganizations: (data ?? []) as NationalOrgSearchRow[] });
}
