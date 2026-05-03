import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticateCrowdedApiRequest } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { canManageChapterForContext, type ProfileForPermission } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { isFeatureEnabled, type ChapterFeatureFlags } from '@/types/featureFlags';

export type DonationCampaignsCreateBackend = 'stripe' | 'crowded';

type ProfileRow = {
  role: string | null;
  chapter_id: string | null;
  chapter_role: string | null;
  is_developer: boolean | null;
};

type SpaceDonationRow = {
  id: string;
  feature_flags: ChapterFeatureFlags | null;
  crowded_chapter_id: string | null;
  stripe_connect_account_id: string | null;
  stripe_charges_enabled: boolean | null;
};

/**
 * Auth + chapter manager (or admin / developer / governance) + chapter row from `spaces`.
 * Chooses **Stripe** when financial tools + Stripe donations + Connect are ready; otherwise **Crowded** when integration + link exist.
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
      /** Backend used for `POST …/donations/campaigns` (Stripe preferred when ready). */
      createBackend: DonationCampaignsCreateBackend;
      crowdedChapterId: string | null;
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
    .select('id, feature_flags, crowded_chapter_id, stripe_connect_account_id, stripe_charges_enabled')
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

  const crowdedReady =
    isFeatureEnabled(featureFlags, 'crowded_integration_enabled') &&
    Boolean((row.crowded_chapter_id as string | null)?.trim());

  if (!stripeReady && !crowdedReady) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'Donation drives need either Stripe Connect (financial tools + Stripe donations + completed Connect onboarding) or Crowded integration with a linked Crowded chapter.',
        },
        { status: 403 }
      ),
    };
  }

  const createBackend: DonationCampaignsCreateBackend = stripeReady ? 'stripe' : 'crowded';

  return {
    ok: true,
    supabase,
    userId: user.id,
    featureFlags,
    createBackend,
    crowdedChapterId: (row.crowded_chapter_id as string | null)?.trim() || null,
    stripeConnectAccountId: (row.stripe_connect_account_id as string | null)?.trim() || null,
  };
}
