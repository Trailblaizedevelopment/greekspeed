import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChapterDonationBrowseEntry } from '@/types/chapterDonationBrowse';
import type { MyDonationCampaignShare } from '@/types/myDonationCampaignShares';
import { listMyDonationCampaignShares } from '@/lib/services/donations/myDonationCampaignSharesService';
import { loadMergedDonationCampaignAggregates } from '@/lib/services/donations/mergedDonationCampaignAggregates';
import { isDonationCampaignStripeDrive, type DonationCampaignKind } from '@/types/donationCampaigns';

/**
 * Chapter donation hub (member browse): `metadata.chapter_hub_visible` from the treasurer toggle.
 * Rows created before that flag may still list if `kind === 'fundraiser'` and
 * `showOnPublicFundraisingChannels` is true (until the flag is set explicitly).
 */
export function isDonationChapterHubPublic(metadata: unknown, kind?: string): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }
  const m = metadata as Record<string, unknown>;
  if ('chapter_hub_visible' in m) {
    const hub = m.chapter_hub_visible;
    return hub === true || hub === 'true';
  }
  if (kind === 'fundraiser') {
    const s = m.showOnPublicFundraisingChannels;
    return s === true || s === 'true';
  }
  return false;
}

export async function listChapterDonationBrowse(params: {
  supabase: SupabaseClient;
  userId: string;
  chapterId: string;
}): Promise<{ ok: true; entries: ChapterDonationBrowseEntry[] } | { ok: false; error: string }> {
  const sharedResult = await listMyDonationCampaignShares({
    supabase: params.supabase,
    userId: params.userId,
    scopeChapterId: params.chapterId,
  });

  if (!sharedResult.ok) {
    return { ok: false, error: sharedResult.error };
  }

  const sharedByCampaignId = new Map<string, MyDonationCampaignShare>();
  for (const row of sharedResult.rows) {
    sharedByCampaignId.set(row.campaignId, row);
  }

  const { data: campaigns, error: campError } = await params.supabase
    .from('donation_campaigns')
    .select(
      'id, chapter_id, title, kind, description, hero_image_url, goal_amount_cents, requested_amount_cents, crowded_share_url, crowded_collection_id, stripe_price_id, metadata, created_at'
    )
    .eq('chapter_id', params.chapterId)
    .order('created_at', { ascending: false });

  if (campError) {
    return { ok: false, error: campError.message || 'Failed to load campaigns' };
  }

  const campaignList = campaigns ?? [];
  const campaignIds = campaignList.map((c) => c.id as string).filter(Boolean);

  let aggByCampaign = new Map<
    string,
    {
      totalRaisedCents: number;
      sharedRecipientCount: number;
      paidRecipientCount: number;
      contributors: MyDonationCampaignShare['contributors'];
    }
  >();
  if (campaignIds.length > 0) {
    const merged = await loadMergedDonationCampaignAggregates({
      supabase: params.supabase,
      campaignIds,
    });
    if (!merged.ok) {
      return { ok: false, error: merged.error };
    }
    aggByCampaign = merged.byCampaign;
  }

  const entries: ChapterDonationBrowseEntry[] = [];

  for (const c of campaignList) {
    const id = c.id as string;
    const kind = c.kind as DonationCampaignKind;
    const metadata = c.metadata as unknown;
    const createdAt = (c.created_at as string) ?? new Date().toISOString();

    const shared = sharedByCampaignId.get(id);
    if (shared) {
      entries.push({
        listingSource: 'shared_with_you',
        share: shared,
        campaignCreatedAt: createdAt,
      });
      continue;
    }

    if (!isDonationChapterHubPublic(metadata, kind)) {
      continue;
    }

    const agg =
      aggByCampaign.get(id) ??
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

    const crowdedCollectionId = (c.crowded_collection_id as string | null | undefined) ?? null;
    const stripePriceId = (c.stripe_price_id as string | null | undefined) ?? null;
    const stripeDrive = isDonationCampaignStripeDrive({
      stripe_price_id: stripePriceId,
      crowded_collection_id: crowdedCollectionId,
    });
    const paymentProvider = stripeDrive ? ('stripe' as const) : ('crowded' as const);
    const campaignPayUrl = (c.crowded_share_url as string | null | undefined)?.trim() || null;

    const synthetic: MyDonationCampaignShare = {
      recipientId: `chapter-public:${id}`,
      sharedAt: createdAt,
      campaignId: id,
      title: (c.title as string) ?? 'Donation',
      kind,
      description: (c.description as string | null | undefined) ?? null,
      heroImageUrl: (c.hero_image_url as string | null | undefined) ?? null,
      goalAmountCents: c.goal_amount_cents as number | null,
      requestedAmountCents: c.requested_amount_cents as number | null,
      checkoutUrl: campaignPayUrl,
      paymentProvider,
      crowdedShareUrl: campaignPayUrl,
      crowdedCollectionId,
      myAmountPaidCents: null,
      myPaidAt: null,
      campaignTotalRaisedCents: agg.totalRaisedCents,
      campaignSharedRecipientCount: agg.sharedRecipientCount,
      campaignPaidRecipientCount: agg.paidRecipientCount,
      contributors: agg.contributors,
    };

    entries.push({
      listingSource: 'chapter_public',
      share: synthetic,
      campaignCreatedAt: createdAt,
    });
  }

  entries.sort((a, b) => {
    const ta = new Date(a.campaignCreatedAt).getTime();
    const tb = new Date(b.campaignCreatedAt).getTime();
    return tb - ta;
  });

  return { ok: true, entries };
}
