import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { generateUniqueUsername, generateProfileSlug } from '@/lib/utils/usernameUtils';
import { cascadeDeleteUser } from '@/lib/services/userDeletionService';
import { upsertSpaceMembership } from '@/lib/services/spaceMembershipService';

async function authenticateRequest(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return {
        user,
        supabase: createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!),
      };
    }
  }

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return {
      user,
      supabase: createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!),
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, supabase } = auth;

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('is_developer')
      .eq('id', user.id)
      .single();

    const isDeveloper = callerProfile?.is_developer === true;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // Single user fetch (for edit modal: include governance_chapter_ids only for developers)
    if (userId) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError || !profile) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const userPayload: Record<string, unknown> = { ...profile };
      // Only include governance_chapter_ids when caller is a developer
      if (profile.role === 'governance' && isDeveloper) {
        const { data: rows } = await supabase
          .from('governance_chapters')
          .select('chapter_id')
          .eq('user_id', userId);
        userPayload.governance_chapter_ids = (rows ?? []).map((r: { chapter_id: string }) => r.chapter_id);
      }

      if (isDeveloper) {
        const { data: memRows, error: memErr } = await supabase
          .from('space_memberships')
          .select('id, space_id, role, status, is_primary, is_space_icon')
          .eq('user_id', userId)
          .neq('status', 'inactive');

        if (memErr) {
          console.error('developer users GET space_memberships:', memErr);
          userPayload.space_memberships = [];
        } else if (memRows && memRows.length > 0) {
          const spaceIds = [...new Set(memRows.map((m) => m.space_id as string))];
          const { data: spaces } = await supabase.from('spaces').select('id, name').in('id', spaceIds);
          const nameBy = new Map((spaces ?? []).map((s) => [s.id as string, (s.name as string) ?? '']));
          userPayload.space_memberships = memRows.map((m) => ({
            membership_id: m.id,
            space_id: m.space_id,
            space_name: nameBy.get(m.space_id as string) ?? 'Unknown space',
            membership_role: m.status === 'alumni' ? 'alumni' : 'active_member',
            is_primary: Boolean(m.is_primary),
          }));
        } else {
          userPayload.space_memberships = [];
        }
      }

      return NextResponse.json({ user: userPayload });
    }

    // List users
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;
    const chapterId = searchParams.get('chapterId');
    const q = (searchParams.get('q') || '').trim();
    const role = searchParams.get('role');
    const spaceIconOnly = searchParams.get('spaceIconOnly') === 'true';

    if (spaceIconOnly) {
      let memQuery = supabase
        .from('space_memberships')
        .select('user_id')
        .eq('is_space_icon', true)
        .neq('status', 'inactive');

      if (chapterId) {
        memQuery = memQuery.eq('space_id', chapterId);
      }

      const { data: memRows, error: memError } = await memQuery.limit(5000);

      if (memError) {
        console.error('Error fetching space icon memberships:', memError);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
      }

      const iconUserIds = [
        ...new Set((memRows ?? []).map((r) => r.user_id).filter((id): id is string => Boolean(id))),
      ];

      if (iconUserIds.length === 0) {
        return NextResponse.json({
          users: [],
          total: 0,
          page,
          limit,
          totalPages: 1,
        });
      }

      type ProfileRow = Record<string, unknown> & { id: string; created_at?: string };
      const byId = new Map<string, ProfileRow>();
      const chunkSize = 100;
      for (let i = 0; i < iconUserIds.length; i += chunkSize) {
        const chunk = iconUserIds.slice(i, i + chunkSize);
        const { data: chunkRows, error: chunkError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', chunk);

        if (chunkError) {
          console.error('Error fetching space icon profiles:', chunkError);
          return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
        }

        for (const row of chunkRows ?? []) {
          const p = row as ProfileRow;
          if (p.id) byId.set(p.id, p);
        }
      }

      let merged = [...byId.values()];

      if (q) {
        const needle = q.toLowerCase();
        merged = merged.filter((p) =>
          [p.email, p.full_name, p.role, p.chapter].some((x) =>
            String(x ?? '').toLowerCase().includes(needle)
          )
        );
      }

      if (role) {
        merged = merged.filter((p) => p.role === role);
      }

      merged.sort((a, b) => {
        const ta = new Date(String(a.created_at ?? 0)).getTime();
        const tb = new Date(String(b.created_at ?? 0)).getTime();
        return tb - ta;
      });

      const total = merged.length;
      const users = merged.slice(offset, offset + limit);

      return NextResponse.json({
        users,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    }

    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (chapterId) {
      query = query.eq('chapter_id', chapterId);
    }

    if (q) {
      const like = `%${q}%`;
      query = query.or(
        `email.ilike.${like},full_name.ilike.${like},role.ilike.${like},chapter.ilike.${like}`
      );
    }

    if (role) {
      query = query.eq('role', role);
    }

    const { data: users, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    return NextResponse.json({
      users: users || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, role, isDeveloper, firstName, lastName, chapter, memberStatus } = body;

    // Create a new Supabase client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // First, create the user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 });
    }

    // Generate username and slug
    const username = await generateUniqueUsername(supabase, firstName, lastName, authData.user.id);
    const profileSlug = generateProfileSlug(username);

    // Then, create the profile record
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
        username: username,
        profile_slug: profileSlug,
        role,
        chapter,
        member_status: memberStatus,
        is_developer: isDeveloper,
        developer_permissions: isDeveloper ? ['view_users'] : [],
        access_level: isDeveloper ? 'standard' : 'standard',
        onboarding_completed: true,               
        onboarding_completed_at: new Date().toISOString(), 
      });

    if (profileError) {
      console.error('Profile error:', profileError);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'User created successfully',
      user: authData.user 
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const result = await cascadeDeleteUser(supabase, userId);

    if (!result.success && result.errors.includes('User not found')) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(result, {
      status: result.success ? 200 : 207, // 207 Multi-Status if partial
    });
  } catch (error) {
    console.error('❌ Unexpected error during user deletion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, supabase } = auth;

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('is_developer')
      .eq('id', user.id)
      .single();

    const isDeveloper = callerProfile?.is_developer === true;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'User ID is required' }, { status: 400 });

    const body = await request.json();

    // Only developers can assign governance role or governance_chapter_ids
    const requestedRole = body.role;
    const governanceChapterIds = Array.isArray(body.governance_chapter_ids)
      ? body.governance_chapter_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];
    if (
      (requestedRole === 'governance' || governanceChapterIds.length > 0) &&
      !isDeveloper
    ) {
      return NextResponse.json(
        { error: 'Only developers can assign governance roles' },
        { status: 403 }
      );
    }

    const allowed = ['role', 'chapter_role', 'member_status', 'chapter_id'];
    const update: Record<string, unknown> = {};
    for (const key of allowed) if (key in body) update[key] = body[key];

    if (update.role && !['admin', 'active_member', 'alumni', 'governance'].includes(update.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    if (typeof update.chapter_role === 'string') {
      update.chapter_role = update.chapter_role
        .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 50);
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', userId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });

    // Sync governance_chapters when role or governance_chapter_ids are provided
    await supabase.from('governance_chapters').delete().eq('user_id', userId);
    if (data.role === 'governance' && governanceChapterIds.length > 0) {
      await supabase.from('governance_chapters').insert(
        governanceChapterIds.map((chapter_id: string) => ({ user_id: userId, chapter_id }))
      );
    }

    const spaceMembershipRolesSchema = z.array(
      z.object({
        space_id: z.string().uuid(),
        membership_role: z.enum(['active_member', 'alumni']),
      })
    );

    if (body.space_membership_roles !== undefined && body.space_membership_roles !== null) {
      if (!isDeveloper) {
        return NextResponse.json(
          { error: 'Only developers can update additional space membership roles' },
          { status: 403 }
        );
      }
      const parsedSmr = spaceMembershipRolesSchema.safeParse(body.space_membership_roles);
      if (!parsedSmr.success) {
        return NextResponse.json(
          { error: 'Invalid space_membership_roles', details: parsedSmr.error.flatten() },
          { status: 400 }
        );
      }

      for (const row of parsedSmr.data) {
        const { data: mem, error: memFetchErr } = await supabase
          .from('space_memberships')
          .select('id, is_primary, is_space_icon')
          .eq('user_id', userId)
          .eq('space_id', row.space_id)
          .neq('status', 'inactive')
          .maybeSingle();

        if (memFetchErr) {
          console.error('developer users PUT membership fetch:', memFetchErr);
          return NextResponse.json({ error: 'Failed to load membership' }, { status: 500 });
        }
        if (!mem) {
          return NextResponse.json(
            { error: `No active membership for space ${row.space_id}` },
            { status: 400 }
          );
        }
        if (mem.is_primary) {
          return NextResponse.json(
            {
              error:
                'Primary (home) space membership cannot be changed via this field; update System Role or use assign-membership.',
            },
            { status: 400 }
          );
        }

        const status = row.membership_role === 'alumni' ? 'alumni' : 'active';
        const up = await upsertSpaceMembership(supabase, {
          userId,
          spaceId: row.space_id,
          role: row.membership_role,
          status,
          isPrimary: false,
        });
        if (!up.ok) {
          return NextResponse.json({ error: up.error ?? 'Membership update failed' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ user: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}