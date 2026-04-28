import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import type { MemberSpace } from '@/types/spaceMembership';

/**
 * TRA-661: Returns spaces the authenticated user is a member of.
 * Sourced from space_memberships joined with spaces.
 * Falls back to profiles.chapter_id for users without membership rows yet.
 */
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

    // Fetch memberships from space_memberships + join spaces
    const { data: memberships, error: membershipError } = await supabase
      .from('space_memberships')
      .select('space_id, role, status, is_primary, is_space_icon')
      .eq('user_id', user.id)
      .neq('status', 'inactive');

    if (membershipError) {
      console.error('member-spaces: membership fetch error:', membershipError);
    }

    const memberSpaces: MemberSpace[] = [];

    if (memberships && memberships.length > 0) {
      const spaceIds = memberships.map((m) => m.space_id);
      const { data: spaces, error: spacesError } = await supabase
        .from('spaces')
        .select('id, name, school, slug')
        .in('id', spaceIds);

      if (spacesError) {
        console.error('member-spaces: spaces fetch error:', spacesError);
        return NextResponse.json({ error: 'Failed to fetch spaces' }, { status: 500 });
      }

      const spaceMap = new Map(
        (spaces ?? []).map((s) => [s.id, s])
      );

      for (const m of memberships) {
        const space = spaceMap.get(m.space_id);
        if (space) {
          memberSpaces.push({
            id: space.id,
            name: space.name,
            school: space.school ?? null,
            slug: space.slug ?? null,
            is_primary: m.is_primary,
            is_space_icon: m.is_space_icon ?? false,
            membership_status: m.status,
            membership_role: m.role,
          });
        }
      }
    } else {
      // Fallback: user has no space_memberships rows yet (pre-backfill edge case)
      const { data: profile } = await supabase
        .from('profiles')
        .select('chapter_id, role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.chapter_id) {
        const { data: space } = await supabase
          .from('spaces')
          .select('id, name, school, slug')
          .eq('id', profile.chapter_id)
          .maybeSingle();

        if (space) {
          memberSpaces.push({
            id: space.id,
            name: space.name,
            school: space.school ?? null,
            slug: space.slug ?? null,
            is_primary: true,
            is_space_icon: false,
            membership_status: profile.role === 'alumni' ? 'alumni' : 'active',
            membership_role: profile.role ?? 'active_member',
          });
        }
      }
    }

    // Sort: primary first, then alphabetical
    memberSpaces.sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      spaces: memberSpaces,
      has_multiple: memberSpaces.length > 1,
    });
  } catch (error) {
    console.error('member-spaces API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
