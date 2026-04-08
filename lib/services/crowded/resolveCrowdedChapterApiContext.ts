import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { canManageChapterForContext, type ProfileForPermission } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { isFeatureEnabled } from '@/types/featureFlags';

/** Shared for Crowded API routes: Bearer or cookies + service-role client for DB checks. */
export async function authenticateCrowdedApiRequest(request: NextRequest): Promise<{
  user: { id: string };
  supabase: SupabaseClient;
} | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

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

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return {
      user,
      supabase: createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!),
    };
  } catch {
    return null;
  }
}

/**
 * Auth + chapter manager check + `crowded_integration_enabled` + `crowded_chapter_id` for Trailblaize `chapters.id`.
 * Returns a JSON {@link NextResponse} on failure, or Crowded chapter UUID for API calls.
 */
export async function resolveCrowdedChapterApiContext(
  request: NextRequest,
  trailblaizeChapterId: string
): Promise<
  | { ok: true; crowdedChapterId: string }
  | { ok: false; response: NextResponse }
> {
  const auth = await authenticateCrowdedApiRequest(request);
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { user, supabase } = auth;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, chapter_id, chapter_role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, response: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) };
  }

  let managedChapterIds: string[] | undefined;
  if (profile.role === 'governance') {
    managedChapterIds = await getManagedChapterIds(supabase, user.id);
  }

  if (!canManageChapterForContext(profile as ProfileForPermission, trailblaizeChapterId, managedChapterIds)) {
    return { ok: false, response: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('id, feature_flags, crowded_chapter_id')
    .eq('id', trailblaizeChapterId)
    .maybeSingle();

  if (chapterError || !chapter) {
    return { ok: false, response: NextResponse.json({ error: 'Chapter not found' }, { status: 404 }) };
  }

  if (!isFeatureEnabled(chapter.feature_flags, 'crowded_integration_enabled')) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Crowded integration is not enabled for this chapter' },
        { status: 403 }
      ),
    };
  }

  const crowdedChapterId = chapter.crowded_chapter_id as string | null;
  if (!crowdedChapterId?.trim()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Chapter is not linked to Crowded (missing crowded_chapter_id)' },
        { status: 400 }
      ),
    };
  }

  return { ok: true, crowdedChapterId: crowdedChapterId.trim() };
}
