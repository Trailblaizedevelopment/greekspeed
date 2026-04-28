import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDeveloperWithServiceClient } from '@/lib/api/requireDeveloperServiceClient';

/**
 * GET /api/developer/spaces/:spaceId/members
 * Active (non-inactive) memberships with minimal profile fields.
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

  const { data: memberships, error: mErr } = await auth.service
    .from('space_memberships')
    .select('id, user_id, role, status, is_primary, is_space_icon, created_at, updated_at')
    .eq('space_id', spaceId)
    .neq('status', 'inactive')
    .order('created_at', { ascending: true });

  if (mErr) {
    console.error('developer space members:', mErr);
    return NextResponse.json({ error: 'Failed to load memberships' }, { status: 500 });
  }

  const rows = memberships ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];

  let profileById = new Map<
    string,
    { id: string; email: string | null; full_name: string | null; avatar_url: string | null }
  >();

  if (userIds.length > 0) {
    const { data: profiles, error: pErr } = await auth.service
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .in('id', userIds);

    if (pErr) {
      console.error('developer space members profiles:', pErr);
      return NextResponse.json({ error: 'Failed to load profiles' }, { status: 500 });
    }

    profileById = new Map(
      (profiles ?? []).map((p) => [
        p.id as string,
        {
          id: p.id as string,
          email: (p.email as string | null) ?? null,
          full_name: (p.full_name as string | null) ?? null,
          avatar_url: (p.avatar_url as string | null) ?? null,
        },
      ])
    );
  }

  const members = rows.map((m) => {
    const p = profileById.get(m.user_id as string);
    return {
      membership_id: m.id,
      user_id: m.user_id,
      role: m.role,
      status: m.status,
      is_primary: m.is_primary,
      is_space_icon: m.is_space_icon,
      created_at: m.created_at,
      updated_at: m.updated_at,
      email: p?.email ?? null,
      full_name: p?.full_name ?? null,
      avatar_url: p?.avatar_url ?? null,
    };
  });

  return NextResponse.json({ members, total: members.length });
}
