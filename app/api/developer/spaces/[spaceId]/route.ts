import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDeveloperWithServiceClient } from '@/lib/api/requireDeveloperServiceClient';

const patchSchema = z
  .object({
    name: z.string().min(1).max(500).optional(),
    slug: z.string().min(1).max(500).optional(),
    description: z.string().max(20000).optional().nullable(),
    school: z.string().max(500).optional().nullable(),
    school_location: z.string().max(500).optional().nullable(),
    national_fraternity: z.string().max(500).optional().nullable(),
    chapter_name: z.string().max(500).optional().nullable(),
    space_type: z.string().max(200).optional().nullable(),
    university: z.string().max(500).optional().nullable(),
    location: z.string().max(500).optional().nullable(),
    chapter_status: z.string().max(80).optional().nullable(),
    member_count: z.number().int().min(0).optional().nullable(),
    founded_year: z.number().int().min(1800).max(2100).optional().nullable(),
    events: z.unknown().optional().nullable(),
    achievements: z.unknown().optional().nullable(),
    school_id: z.string().uuid().optional().nullable(),
    national_organization_id: z.string().uuid().optional().nullable(),
  })
  .strict();

/**
 * GET /api/developer/spaces/:spaceId — single space row (developer + service client).
 * PATCH — partial update with allowlisted columns only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const auth = await requireDeveloperWithServiceClient(_request);
  if (!auth.ok) return auth.response;

  const { spaceId } = await params;
  if (!z.string().uuid().safeParse(spaceId).success) {
    return NextResponse.json({ error: 'Invalid space id' }, { status: 400 });
  }

  const { data, error } = await auth.service.from('spaces').select('*').eq('id', spaceId).maybeSingle();

  if (error) {
    console.error('developer space GET:', error);
    return NextResponse.json({ error: 'Failed to load space' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }

  const row = data as Record<string, unknown>;
  const schoolId = typeof row.school_id === 'string' ? row.school_id : null;
  const orgId = typeof row.national_organization_id === 'string' ? row.national_organization_id : null;

  let linked_school: {
    id: string;
    name: string;
    short_name: string | null;
    location: string | null;
  } | null = null;
  let linked_national_organization: {
    id: string;
    name: string;
    short_name: string | null;
  } | null = null;

  if (schoolId) {
    const { data: s, error: sErr } = await auth.service
      .from('schools')
      .select('id,name,short_name,location')
      .eq('id', schoolId)
      .maybeSingle();
    if (!sErr && s) {
      linked_school = {
        id: String(s.id),
        name: String(s.name ?? ''),
        short_name: s.short_name != null ? String(s.short_name) : null,
        location: s.location != null ? String(s.location) : null,
      };
    }
  }

  if (orgId) {
    const { data: o, error: oErr } = await auth.service
      .from('national_organizations')
      .select('id,name,short_name')
      .eq('id', orgId)
      .maybeSingle();
    if (!oErr && o) {
      linked_national_organization = {
        id: String(o.id),
        name: String(o.name ?? ''),
        short_name: o.short_name != null ? String(o.short_name) : null,
      };
    }
  }

  return NextResponse.json({ space: data, linked_school, linked_national_organization });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const auth = await requireDeveloperWithServiceClient(request);
  if (!auth.ok) return auth.response;

  const { spaceId } = await params;
  if (!z.string().uuid().safeParse(spaceId).success) {
    return NextResponse.json({ error: 'Invalid space id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) patch[key] = value;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await auth.service.from('spaces').update(patch).eq('id', spaceId).select().single();

  if (error) {
    console.error('developer space PATCH:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ space: data });
}
