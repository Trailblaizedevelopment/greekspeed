import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChapterDonationBrowseEntry } from '@/types/chapterDonationBrowse';
import type { MyDonationCampaignContributor, MyDonationCampaignShare } from '@/types/myDonationCampaignShares';
import { listMyDonationCampaignShares } from '@/lib/services/donations/myDonationCampaignSharesService';
import { isDonationCampaignStripeDrive, type DonationCampaignKind } from '@/types/donationCampaigns';

function coerceCents(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function profileDisplayName(p: {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
}): string {
  const fn = (p.first_name ?? '').trim();
  const ln = (p.last_name ?? '').trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ').trim() || 'Member';
  const full = (p.full_name ?? '').trim();
  return full || 'Member';
}

type CampaignAgg = {
  totalRaisedCents: number;
  sharedRecipientCount: number;
  paidRecipientCount: number;
  contributors: MyDonationCampaignContributor[];
};

function buildCampaignAggregates(
  allRecs: Array<{
    donation_campaign_id: string;
    amount_paid_cents: unknown;
    paid_at: string | null;
    profile_id: string;
  }>,
  profileNameById: Map<string, string>
): Map<string, CampaignAgg> {
  const byCampaign = new Map<
    string,
    Array<{ profileId: string; amountPaidCents: number; paidAt: string | null }>
  >();

  for (const r of allRecs) {
    const capId = r.donation_campaign_id;
    if (!capId) continue;
    const paid = coerceCents(r.amount_paid_cents);
    const list = byCampaign.get(capId) ?? [];
    list.push({
      profileId: r.profile_id,
      amountPaidCents: paid,
      paidAt: r.paid_at,
    });
    byCampaign.set(capId, list);
  }

  const out = new Map<string, CampaignAgg>();

  for (const [campaignId, recList] of byCampaign) {
    let totalRaisedCents = 0;
    let paidRecipientCount = 0;
    for (const x of recList) {
      totalRaisedCents += x.amountPaidCents;
      if (x.amountPaidCents > 0 || (x.paidAt && String(x.paidAt).trim())) {
        paidRecipientCount += 1;
      }
    }

    const paidRows = recList.filter((x) => x.amountPaidCents > 0);
    const contributors: MyDonationCampaignContributor[] = paidRows
      .map((x) => ({
        profileId: x.profileId,
        displayName: profileNameById.get(x.profileId) ?? 'Member',
        amountPaidCents: x.amountPaidCents,
        paidAt: x.paidAt,
      }))
      .sort((a, b) => {
        const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
        const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
        return tb - ta;
      });

    out.set(campaignId, {
      totalRaisedCents,
      sharedRecipientCount: recList.length,
      paidRecipientCount,
      contributors,
    });
  }

  return out;
}

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

  let aggByCampaign = new Map<string, CampaignAgg>();
  if (campaignIds.length > 0) {
    const { data: allRecsRaw, error: aggError } = await params.supabase
      .from('donation_campaign_recipients')
      .select('donation_campaign_id, amount_paid_cents, paid_at, profile_id')
      .in('donation_campaign_id', campaignIds);

    if (aggError) {
      return { ok: false, error: aggError.message || 'Failed to load donation totals' };
    }

    const allRecs = (allRecsRaw ?? []) as Array<{
      donation_campaign_id: string;
      amount_paid_cents: unknown;
      paid_at: string | null;
      profile_id: string;
    }>;

    const contributorProfileIds = [
      ...new Set(
        allRecs
          .filter((r) => coerceCents(r.amount_paid_cents) > 0)
          .map((r) => r.profile_id as string)
          .filter(Boolean)
      ),
    ];

    const profileNameById = new Map<string, string>();
    if (contributorProfileIds.length > 0) {
      const { data: profs, error: profErr } = await params.supabase
        .from('profiles')
        .select('id, first_name, last_name, full_name')
        .in('id', contributorProfileIds);

      if (profErr) {
        return { ok: false, error: profErr.message || 'Failed to load contributor names' };
      }

      for (const p of profs ?? []) {
        const row = p as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
        };
        profileNameById.set(row.id, profileDisplayName(row));
      }
    }

    aggByCampaign = buildCampaignAggregates(allRecs, profileNameById);
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
      } satisfies CampaignAgg);

    const crowdedCollectionId = (c.crowded_collection_id as string | null | undefined) ?? null;
    const stripePriceId = (c.stripe_price_id as string | null | undefined) ?? null;
    const stripeDrive = isDonationCampaignStripeDrive({
      stripe_price_id: stripePriceId,
      crowded_collection_id: crowdedCollectionId,
    });
    const paymentProvider = stripeDrive ? ('stripe' as const) : ('crowded' as const);

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
      checkoutUrl: null,
      paymentProvider,
      crowdedShareUrl: null,
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
