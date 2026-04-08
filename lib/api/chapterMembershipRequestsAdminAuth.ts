import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  canManageMembersForContext,
  type ProfileForPermission,
} from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';

export type ChapterMembershipAdminAuthSuccess = {
  supabase: SupabaseClient;
  userId: string;
  profile: ProfileForPermission;
};

/**
 * Bearer + service-role client, then verify caller may manage members for the given chapter
 * (platform admin, chapter exec, or governance with managed/home chapter).
 */
export async function authenticateAdminForChapterMembership(
  request: NextRequest,
  chapterId: string,
  existingSupabase?: SupabaseClient
): Promise<
  | ({ ok: true } & ChapterMembershipAdminAuthSuccess)
  | { ok: false; response: NextResponse }
> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }),
    };
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase =
    existingSupabase ?? createClient(supabaseUrl, supabaseServiceKey);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid authentication' }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, chapter_id, chapter_role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Profile not found' }, { status: 404 }),
    };
  }

  let managedChapterIds: string[] | undefined;
  if (profile.role === 'governance') {
    managedChapterIds = await getManagedChapterIds(supabase, user.id);
  }

  if (!canManageMembersForContext(profile, chapterId, managedChapterIds)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
    };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    profile: profile as ProfileForPermission,
  };
}
