import { NextRequest, NextResponse } from 'next/server';
import { requireDeveloperWithServiceClient } from '@/lib/api/requireDeveloperServiceClient';
import { postgrestIlikeQuotedPattern } from '@/lib/api/developerChapterSpacePayload';

/**
 * GET /api/developer/reference/schools?q=&limit=
 * Searchable directory for chapter create/edit (developer-gated).
 */
export async function GET(request: NextRequest) {
  const auth = await requireDeveloperWithServiceClient(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '30', 10) || 30));

  let query = auth.service
    .from('schools')
    .select('id,name,short_name,location,domain')
    .order('name', { ascending: true })
    .limit(limit);

  const token = postgrestIlikeQuotedPattern(q);
  if (token) {
    query = query.or(`name.ilike.${token},short_name.ilike.${token}`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('developer reference schools:', error);
    return NextResponse.json({ error: 'Failed to load schools' }, { status: 500 });
  }

  return NextResponse.json({ schools: data ?? [] });
}
