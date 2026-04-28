import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { postgrestIlikeQuotedPattern } from '@/lib/api/developerChapterSpacePayload';
import { searchOpenAlexEducationInstitutions } from '@/lib/schools/openAlexInstitutions';
import { mergeSchoolSearchHits } from '@/lib/schools/mergeSchoolSearchHits';
import type { SchoolSearchHit } from '@/lib/schools/types';

const MIN_Q_LEN = 2;
const MAX_LIMIT = 50;
const CACHE_TTL_MS = 45_000;
const CACHE_MAX = 80;

type CacheEntry = { at: number; schools: SchoolSearchHit[] };
const searchCache = new Map<string, CacheEntry>();

function cacheKey(q: string, limit: number): string {
  return `${q.trim().toLowerCase()}::${limit}`;
}

function pruneCache() {
  const now = Date.now();
  if (searchCache.size <= CACHE_MAX) return;
  for (const [k, v] of searchCache) {
    if (now - v.at > CACHE_TTL_MS) searchCache.delete(k);
  }
  while (searchCache.size > CACHE_MAX) {
    const first = searchCache.keys().next().value as string | undefined;
    if (!first) break;
    searchCache.delete(first);
  }
}

/**
 * GET /api/schools/search?q=&limit=
 * Public: merges local `schools` rows with OpenAlex education-institution search (no API key).
 * OpenAlex hits use `source: "openalex"` and a synthetic `id` until POST /api/schools/materialize stores them.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get('limit') || '30', 10) || 30),
  );

  if (q.length < MIN_Q_LEN) {
    return NextResponse.json({ schools: [] as SchoolSearchHit[] });
  }

  const ck = cacheKey(q, limit);
  const cached = searchCache.get(ck);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ schools: cached.schools });
  }

  const supabase = createServerSupabaseClient();

  const localLimit = Math.min(limit, 25);
  let localQuery = supabase
    .from('schools')
    .select('id,name,short_name,location,domain')
    .order('name', { ascending: true })
    .limit(localLimit);

  const tokenPattern = postgrestIlikeQuotedPattern(q);
  if (tokenPattern) {
    localQuery = localQuery.or(`name.ilike.${tokenPattern},short_name.ilike.${tokenPattern},domain.ilike.${tokenPattern}`);
  }

  const [{ data: localRows, error: localError }, openAlexHits] = await Promise.all([
    localQuery,
    searchOpenAlexEducationInstitutions(q, Math.min(25, limit)),
  ]);

  if (localError) {
    console.error('schools search local:', localError);
    return NextResponse.json({ error: 'Failed to load schools' }, { status: 500 });
  }

  const localHits: SchoolSearchHit[] = (localRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    short_name: row.short_name,
    location: row.location,
    domain: row.domain ?? null,
    source: 'database' as const,
  }));

  const merged = mergeSchoolSearchHits(localHits, openAlexHits, limit);
  searchCache.set(ck, { at: Date.now(), schools: merged });
  pruneCache();

  return NextResponse.json({ schools: merged });
}
