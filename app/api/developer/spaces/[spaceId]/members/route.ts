import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDeveloperWithServiceClient } from '@/lib/api/requireDeveloperServiceClient';

/**
 * GET /api/developer/spaces/:spaceId/members
 * Active (non-inactive) memberships with minimal profile fields.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const auth = await requireDeveloperWithServiceClient(request);
  if (!auth.ok) return auth.response;

  const { spaceId } = await params;
  if (!z.string().uuid().safeParse(spaceId).success) {
    return NextResponse.json({ error: 'Invalid space id' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const qRaw = (searchParams.get('q') ?? '').trim();
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10) || 25));
  const offset = (page - 1) * limit;

  let scopedUserIds: string[] | null = null;
  if (qRaw.length > 0) {
    const q = qRaw.replace(/[%",]/g, '').slice(0, 120);
    if (q.length > 0) {
      const pattern = `%${q}%`;
      let profileQuery = auth.service
        .from('profiles')
        .select('id')
        .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(5000);

      // If search token looks like a UUID, include exact id match for fast lookup.
      if (z.string().uuid().safeParse(q).success) {
        profileQuery = auth.service
          .from('profiles')
          .select('id')
          .or(`id.eq.${q},full_name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(5000);
      }

      const { data: profileHits, error: pHitErr } = await profileQuery;
      if (pHitErr) {
        console.error('developer space members profile search:', pHitErr);
        return NextResponse.json({ error: 'Failed to search members' }, { status: 500 });
      }
      scopedUserIds = (profileHits ?? []).map((p) => String(p.id));
      if (scopedUserIds.length === 0) {
        return NextResponse.json({
          members: [],
          total: 0,
          page,
          limit,
          totalPages: 1,
          q: qRaw,
        });
      }
    }
  }

  let countQuery = auth.service
    .from('space_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('space_id', spaceId)
    .neq('status', 'inactive');

  let membersQuery = auth.service
    .from('space_memberships')
    .select('id, user_id, role, status, is_primary, is_space_icon, created_at, updated_at')
    .eq('space_id', spaceId)
    .neq('status', 'inactive')
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (scopedUserIds && scopedUserIds.length > 0) {
    countQuery = countQuery.in('user_id', scopedUserIds);
    membersQuery = membersQuery.in('user_id', scopedUserIds);
  }

  const [{ count, error: cErr }, { data: memberships, error: mErr }] = await Promise.all([
    countQuery,
    membersQuery,
  ]);

  if (cErr || mErr) {
    console.error('developer space members:', cErr ?? mErr);
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

  const total = count ?? 0;
  return NextResponse.json({
    members,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    q: qRaw || null,
  });
}
