import type { SupabaseClient } from '@supabase/supabase-js';
import type { MyDonationCampaignContributor, MyDonationCampaignShare } from '@/types/myDonationCampaignShares';
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

  const aggByCampaign = buildCampaignAggregates(allRecs, profileNameById);

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

    const recipientCrowded = (raw.crowded_checkout_url as string | null | undefined)?.trim() || null;
    const recipientStripe = (raw.stripe_checkout_url as string | null | undefined)?.trim() || null;
    const campaignShare = campaign.crowded_share_url?.trim() || null;
    const stripeDrive = isDonationCampaignStripeDrive({
      stripe_price_id: campaign.stripe_price_id,
      crowded_collection_id: campaign.crowded_collection_id,
    });
    const paymentProvider = stripeDrive ? ('stripe' as const) : ('crowded' as const);
    const checkoutUrl = stripeDrive
      ? recipientStripe || campaignShare || null
      : recipientCrowded || campaignShare || null;

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
      } satisfies CampaignAgg);

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
