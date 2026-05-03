import type { SupabaseClient } from '@supabase/supabase-js';
import type { MyDonationCampaignShare } from '@/types/myDonationCampaignShares';
import { loadMergedDonationCampaignAggregates } from '@/lib/services/donations/mergedDonationCampaignAggregates';
import { isDonationCampaignStripeDrive, type DonationCampaignKind } from '@/types/donationCampaigns';

function coerceCents(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function recipientIsPaid(amountPaidCents: unknown, paidAt: unknown): boolean {
  if (paidAt && String(paidAt).trim()) return true;
  return coerceCents(amountPaidCents) > 0;
}

export async function listMyDonationCampaignShares(params: {
  supabase: SupabaseClient;
  userId: string;
  /**
   * When set, only campaigns in this chapter are included (chapter donation hub / view-as).
   * When omitted, uses `profiles.chapter_id` for the member dashboard card.
   */
  scopeChapterId?: string;
}): Promise<{ ok: true; rows: MyDonationCampaignShare[] } | { ok: false; error: string }> {
  const { data: profile, error: profileError } = await params.supabase
    .from('profiles')
    .select('chapter_id')
    .eq('id', params.userId)
    .maybeSingle();

  if (profileError) {
    return { ok: false, error: profileError.message || 'Failed to load profile' };
  }

  const scoped = typeof params.scopeChapterId === 'string' ? params.scopeChapterId.trim() : '';
  const chapterId =
    scoped ||
    ((profile?.chapter_id as string | null | undefined) ?? '').trim() ||
    null;
  if (!chapterId) {
    return { ok: true, rows: [] };
  }

  const { data: recs, error: recError } = await params.supabase
    .from('donation_campaign_recipients')
    .select(
      'id, donation_campaign_id, created_at, crowded_checkout_url, stripe_checkout_url, amount_paid_cents, paid_at'
    )
    .eq('profile_id', params.userId)
    .order('created_at', { ascending: false });

  if (recError) {
    return { ok: false, error: recError.message || 'Failed to load donation shares' };
  }

  const list = recs ?? [];
  if (list.length === 0) {
    return { ok: true, rows: [] };
  }

  const campaignIds = [...new Set(list.map((r) => r.donation_campaign_id as string).filter(Boolean))];
  if (campaignIds.length === 0) {
    return { ok: true, rows: [] };
  }

  const { data: campaigns, error: campError } = await params.supabase
    .from('donation_campaigns')
    .select(
      'id, chapter_id, title, kind, description, hero_image_url, goal_amount_cents, requested_amount_cents, crowded_share_url, crowded_collection_id, stripe_price_id'
    )
    .in('id', campaignIds)
    .eq('chapter_id', chapterId);

  if (campError) {
    return { ok: false, error: campError.message || 'Failed to load campaigns' };
  }

  const merged = await loadMergedDonationCampaignAggregates({
    supabase: params.supabase,
    campaignIds,
  });
  if (!merged.ok) {
    return { ok: false, error: merged.error };
  }
  const aggByCampaign = merged.byCampaign;

  const campaignMap = new Map(
    (campaigns ?? []).map((c) => [
      c.id as string,
      {
        id: c.id as string,
        title: c.title as string,
        kind: c.kind as DonationCampaignKind,
        description: (c.description as string | null | undefined) ?? null,
        hero_image_url: (c.hero_image_url as string | null | undefined) ?? null,
        goal_amount_cents: c.goal_amount_cents as number | null,
        requested_amount_cents: c.requested_amount_cents as number | null,
        crowded_share_url: c.crowded_share_url as string | null,
        crowded_collection_id: c.crowded_collection_id as string | null,
        stripe_price_id: c.stripe_price_id as string | null | undefined,
      },
    ])
  );

  const rows: MyDonationCampaignShare[] = [];
  for (const raw of list) {
    const capId = raw.donation_campaign_id as string;
    const campaign = campaignMap.get(capId);
    if (!campaign) continue;

    const recipientStripe = (raw.stripe_checkout_url as string | null | undefined)?.trim() || null;
    const campaignShare = campaign.crowded_share_url?.trim() || null;
    const stripeDrive = isDonationCampaignStripeDrive({
      stripe_price_id: campaign.stripe_price_id,
      crowded_collection_id: campaign.crowded_collection_id,
    });
    if (!stripeDrive) {
      continue;
    }
    const paymentProvider = 'stripe' as const;
    const checkoutUrl = recipientStripe || campaignShare || null;

    const myPaid = coerceCents(raw.amount_paid_cents);
    const myPaidAtRaw = (raw.paid_at as string | null | undefined)?.trim() || null;
    const iPaid = recipientIsPaid(raw.amount_paid_cents, raw.paid_at);
    const myAmountPaidCents = iPaid ? (myPaid > 0 ? myPaid : null) : null;
    const myPaidAt = iPaid ? myPaidAtRaw || null : null;

    const agg =
      aggByCampaign.get(capId) ??
      ({
        totalRaisedCents: 0,
        sharedRecipientCount: 0,
        paidRecipientCount: 0,
        contributors: [],
      } satisfies {
        totalRaisedCents: number;
        sharedRecipientCount: number;
        paidRecipientCount: number;
        contributors: MyDonationCampaignShare['contributors'];
      });

    rows.push({
      recipientId: raw.id as string,
      sharedAt: raw.created_at as string,
      campaignId: campaign.id,
      title: campaign.title,
      kind: campaign.kind,
      description: campaign.description,
      heroImageUrl: campaign.hero_image_url,
      goalAmountCents: campaign.goal_amount_cents,
      requestedAmountCents: campaign.requested_amount_cents,
      checkoutUrl,
      paymentProvider,
      crowdedShareUrl: checkoutUrl,
      crowdedCollectionId: campaign.crowded_collection_id,
      myAmountPaidCents,
      myPaidAt,
      campaignTotalRaisedCents: agg.totalRaisedCents,
      campaignSharedRecipientCount: agg.sharedRecipientCount,
      campaignPaidRecipientCount: agg.paidRecipientCount,
      contributors: agg.contributors,
    });
  }

  return { ok: true, rows };
}
