import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticateCrowdedApiRequest } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { canManageChapterForContext, type ProfileForPermission } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { isFeatureEnabled, type ChapterFeatureFlags } from '@/types/featureFlags';

type ProfileRow = {
  role: string | null;
  chapter_id: string | null;
  chapter_role: string | null;
  is_developer: boolean | null;
};

/**
 * Auth + chapter manager (or admin / developer / governance) + financial tools + Stripe donations flag.
 * Used by `/api/chapters/[id]/stripe-connect`.
 */
export async function resolveStripeChapterConnectApiContext(
  request: NextRequest,
  trailblaizeChapterId: string
): Promise<
  | {
      ok: true;
      supabase: SupabaseClient;
      featureFlags: ChapterFeatureFlags;
    }
  | { ok: false; response: NextResponse }
> {
  const auth = await authenticateCrowdedApiRequest(request);
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { user, supabase } = auth;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, chapter_id, chapter_role, is_developer')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, response: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) };
  }

  const p = profile as ProfileRow;
  let managedChapterIds: string[] | undefined;
  if (p.role === 'governance') {
    managedChapterIds = await getManagedChapterIds(supabase, user.id);
  }

  const canManage =
    p.role === 'admin' ||
    Boolean(p.is_developer) ||
    canManageChapterForContext(p as ProfileForPermission, trailblaizeChapterId, managedChapterIds);

  if (!canManage) {
    return { ok: false, response: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  const { data: chapter, error: chapterError } = await supabase
    .from('spaces')
    .select('id, feature_flags')
    .eq('id', trailblaizeChapterId)
    .maybeSingle();

  if (chapterError || !chapter) {
    return { ok: false, response: NextResponse.json({ error: 'Chapter not found' }, { status: 404 }) };
  }

  const featureFlags = (chapter.feature_flags ?? {}) as ChapterFeatureFlags;

  if (!isFeatureEnabled(featureFlags, 'financial_tools_enabled')) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Financial tools are not enabled for this chapter' },
        { status: 403 }
      ),
    };
  }

  if (!isFeatureEnabled(featureFlags, 'stripe_donations_enabled')) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Stripe donations are not enabled for this chapter' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, supabase, featureFlags };
}
