import { NextRequest, NextResponse } from 'next/server';
import { requireDeveloperWithServiceClient } from '@/lib/api/requireDeveloperServiceClient';
import { searchSpacesWithIconsForDeveloper } from '@/lib/services/developerSpaceSearchService';

/**
 * TRA-665: Developer-only — search `spaces` (seed + real) with optional icon / first-member fields.
 * GET /api/developer/spaces/search?q=…&limit=…
 * Authorization: Bearer <access_token>
 */
export async function GET(request: NextRequest) {
  const auth = await requireDeveloperWithServiceClient(request);
  if (!auth.ok) return auth.response;

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const limit = Math.min(
    50,
    Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '30', 10) || 30)
  );

  if (q.length < 2) {
    return NextResponse.json({ spaces: [] });
  }

  const result = await searchSpacesWithIconsForDeveloper(auth.service, q, limit);
  if (!result.ok) {
    console.error('developer spaces search:', result.error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  return NextResponse.json({ spaces: result.spaces });
}
