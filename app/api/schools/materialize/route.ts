import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import {
  domainFromHomepage,
  fetchOpenAlexInstitutionByShortId,
  formatOpenAlexLocation,
  openAlexShortIdFromUrl,
} from '@/lib/schools/openAlexInstitutions';

const bodySchema = z
  .object({
    openAlexId: z.string().min(2).max(32).optional(),
    /** Accept full OpenAlex URL as well as `I93320256`. */
    openAlexUrl: z.string().url().max(500).optional(),
  })
  .strict()
  .refine((b) => !!(b.openAlexId?.trim() || b.openAlexUrl?.trim()), {
    message: 'openAlexId or openAlexUrl required',
  });

function resolveOpenAlexShortId(body: z.infer<typeof bodySchema>): string | null {
  if (body.openAlexId?.trim()) {
    const m = body.openAlexId.trim().match(/^i(\d+)$/i);
    if (m) return `I${m[1]}`;
  }
  if (body.openAlexUrl?.trim()) {
    return openAlexShortIdFromUrl(body.openAlexUrl.trim());
  }
  return null;
}

/**
 * POST /api/schools/materialize
 * Authenticated: fetches OpenAlex institution, inserts into `schools` (deduped by `openalex_id`), returns UUID row.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const shortId = resolveOpenAlexShortId(parsed.data);
  if (!shortId) {
    return NextResponse.json({ error: 'openAlexId or openAlexUrl required' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from('schools')
    .select('id,name,short_name,location,domain,openalex_id')
    .eq('openalex_id', shortId)
    .maybeSingle();

  if (existingError) {
    console.error('schools materialize lookup:', existingError);
    if (existingError.message?.toLowerCase().includes('openalex_id') || existingError.code === '42703') {
      return NextResponse.json(
        {
          error:
            'Database column openalex_id is missing. Run docs/sql/schools_openalex_id.sql against your database.',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Failed to resolve school' }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({
      school: {
        id: existing.id,
        name: existing.name,
        short_name: existing.short_name,
        location: existing.location,
        domain: existing.domain,
        source: 'database' as const,
      },
    });
  }

  const institution = await fetchOpenAlexInstitutionByShortId(shortId);
  if (!institution?.display_name) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404 });
  }

  if (institution.type && institution.type !== 'education') {
    return NextResponse.json({ error: 'Not an education institution' }, { status: 400 });
  }

  const acronyms = institution.display_name_acronyms ?? [];
  const shortName = acronyms[0]?.trim() || null;
  const row = {
    name: institution.display_name.trim(),
    short_name: shortName,
    location: formatOpenAlexLocation(institution.geo ?? null),
    domain: domainFromHomepage(institution.homepage_url),
    openalex_id: shortId,
    institution_control: 'unknown' as const,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('schools')
    .insert(row)
    .select('id,name,short_name,location,domain,openalex_id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: again } = await supabase
        .from('schools')
        .select('id,name,short_name,location,domain,openalex_id')
        .eq('openalex_id', shortId)
        .maybeSingle();
      if (again) {
        return NextResponse.json({
          school: {
            id: again.id,
            name: again.name,
            short_name: again.short_name,
            location: again.location,
            domain: again.domain,
            source: 'database' as const,
          },
        });
      }
    }
    console.error('schools materialize insert:', insertError);
    if (insertError.message?.toLowerCase().includes('openalex_id') || insertError.code === '42703') {
      return NextResponse.json(
        {
          error:
            'Database column openalex_id is missing. Run docs/sql/schools_openalex_id.sql against your database.',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    school: {
      id: inserted.id,
      name: inserted.name,
      short_name: inserted.short_name,
      location: inserted.location,
      domain: inserted.domain,
      source: 'database' as const,
    },
  });
}
