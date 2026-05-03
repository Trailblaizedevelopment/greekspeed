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

type SpaceDonationRow = {
  id: string;
  feature_flags: ChapterFeatureFlags | null;
  stripe_connect_account_id: string | null;
  stripe_charges_enabled: boolean | null;
};

/**
 * Auth + chapter manager (or admin / developer / governance) + chapter row from `spaces`.
 * Donation APIs require **Stripe Connect** with financial tools + Stripe donations enabled.
 */
export async function resolveDonationCampaignsApiContext(
  request: NextRequest,
  trailblaizeChapterId: string
): Promise<
  | {
      ok: true;
      supabase: SupabaseClient;
      userId: string;
      featureFlags: ChapterFeatureFlags;
      stripeConnectAccountId: string | null;
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

  const { data: space, error: spaceError } = await supabase
    .from('spaces')
    .select('id, feature_flags, stripe_connect_account_id, stripe_charges_enabled')
    .eq('id', trailblaizeChapterId)
    .maybeSingle();

  if (spaceError || !space) {
    return { ok: false, response: NextResponse.json({ error: 'Chapter not found' }, { status: 404 }) };
  }

  const row = space as SpaceDonationRow;
  const featureFlags = (row.feature_flags ?? {}) as ChapterFeatureFlags;

  const stripeReady =
    isFeatureEnabled(featureFlags, 'financial_tools_enabled') &&
    isFeatureEnabled(featureFlags, 'stripe_donations_enabled') &&
    Boolean(row.stripe_connect_account_id?.trim()) &&
    Boolean(row.stripe_charges_enabled);

  if (!stripeReady) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'Donations require Stripe Connect with financial tools and Stripe donations enabled, and completed Connect onboarding.',
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    featureFlags,
    stripeConnectAccountId: (row.stripe_connect_account_id as string | null)?.trim() || null,
  };
}
