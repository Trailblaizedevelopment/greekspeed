import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDeveloperWithServiceClient } from '@/lib/api/requireDeveloperServiceClient';
import { postgrestIlikeQuotedPattern } from '@/lib/api/developerChapterSpacePayload';

const postBody = z
  .object({
    name: z.string().min(1).max(500),
    short_name: z.union([z.string().max(500), z.null()]).optional(),
    type: z.union([z.string().max(200), z.null()]).optional(),
    website_url: z.union([z.string().max(2000), z.null()]).optional(),
    logo_url: z.union([z.string().max(2000), z.null()]).optional(),
  })
  .strict();

/**
 * GET — paginated list for developer directory UI.
 * POST — insert a national_organizations row (minimal columns aligned with seed import shape).
 */
export async function GET(request: NextRequest) {
  const auth = await requireDeveloperWithServiceClient(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
  const offset = (page - 1) * limit;
  const q = (searchParams.get('q') || '').trim();

  let listQuery = auth.service
    .from('national_organizations')
    .select('id,name,short_name,type', { count: 'exact' })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  const token = postgrestIlikeQuotedPattern(q);
  if (token) {
    listQuery = listQuery.or(`name.ilike.${token},short_name.ilike.${token},type.ilike.${token}`);
  }

  const { data, error, count } = await listQuery;

  if (error) {
    console.error('developer directory national_organizations GET:', error);
    return NextResponse.json({ error: 'Failed to load national organizations' }, { status: 500 });
  }

  const total = count ?? 0;
  return NextResponse.json({
    nationalOrganizations: data ?? [],
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperWithServiceClient(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = postBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const row = {
    name: parsed.data.name.trim(),
    short_name: parsed.data.short_name?.trim() || null,
    type: parsed.data.type?.trim() || null,
    website_url: parsed.data.website_url?.trim() || null,
    logo_url: parsed.data.logo_url?.trim() || null,
  };

  const { data, error } = await auth.service
    .from('national_organizations')
    .insert(row)
    .select('id,name,short_name,type')
    .single();

  if (error) {
    console.error('developer directory national_organizations POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ nationalOrganization: data });
}
