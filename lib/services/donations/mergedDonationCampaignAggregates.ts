import type { SupabaseClient } from '@supabase/supabase-js';
import type { MyDonationCampaignContributor } from '@/types/myDonationCampaignShares';

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

export type MergedDonationCampaignAgg = {
  totalRaisedCents: number;
  sharedRecipientCount: number;
  paidRecipientCount: number;
  contributors: MyDonationCampaignContributor[];
};

function buildRecipientOnlyAggregates(
  allRecs: Array<{
    donation_campaign_id: string;
    amount_paid_cents: unknown;
    paid_at: string | null;
    profile_id: string;
  }>,
  profileNameById: Map<string, string>
): Map<string, MergedDonationCampaignAgg> {
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

  const out = new Map<string, MergedDonationCampaignAgg>();

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
        contributorSource: 'recipient' as const,
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

function guestDisplayLabel(email: string | null | undefined): string {
  const e = email?.trim();
  if (!e) return 'Guest donor';
  const at = e.indexOf('@');
  if (at < 1) return 'Guest donor';
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const masked = local.length > 1 ? `${local[0]}***@${domain}` : `***@${domain}`;
  return masked;
}

/**
 * Recipient-based totals plus Payment Link (public) guest rows for chapter donation UIs.
 */
export async function loadMergedDonationCampaignAggregates(params: {
  supabase: SupabaseClient;
  campaignIds: string[];
}): Promise<{ ok: true; byCampaign: Map<string, MergedDonationCampaignAgg> } | { ok: false; error: string }> {
  const campaignIds = params.campaignIds.filter(Boolean);
  if (campaignIds.length === 0) {
    return { ok: true, byCampaign: new Map() };
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

  const recipientAgg = buildRecipientOnlyAggregates(allRecs, profileNameById);

  const { data: publicRowsRaw, error: pubErr } = await params.supabase
    .from('donation_campaign_public_payments')
    .select('id, donation_campaign_id, amount_paid_cents, paid_at, payer_email')
    .in('donation_campaign_id', campaignIds)
    .order('paid_at', { ascending: false });

  if (pubErr) {
    return { ok: false, error: pubErr.message || 'Failed to load public donation payments' };
  }

  const publicRows = (publicRowsRaw ?? []) as Array<{
    id: string;
    donation_campaign_id: string;
    amount_paid_cents: unknown;
    paid_at: string;
    payer_email: string | null;
  }>;

  const publicByCampaign = new Map<string, typeof publicRows>();
  for (const row of publicRows) {
    const cid = row.donation_campaign_id;
    const list = publicByCampaign.get(cid) ?? [];
    list.push(row);
    publicByCampaign.set(cid, list);
  }

  const byCampaign = new Map<string, MergedDonationCampaignAgg>();

  for (const capId of campaignIds) {
    const base =
      recipientAgg.get(capId) ??
      ({
        totalRaisedCents: 0,
        sharedRecipientCount: 0,
        paidRecipientCount: 0,
        contributors: [],
      } satisfies MergedDonationCampaignAgg);

    const guests = publicByCampaign.get(capId) ?? [];
    const guestCents = guests.reduce((s, g) => s + coerceCents(g.amount_paid_cents), 0);
    const guestContributors: MyDonationCampaignContributor[] = guests.map((g) => ({
      profileId: `public:${g.id}`,
      displayName: guestDisplayLabel(g.payer_email),
      amountPaidCents: coerceCents(g.amount_paid_cents),
      paidAt: g.paid_at,
      contributorSource: 'public_guest' as const,
    }));

    const contributors = [...base.contributors, ...guestContributors].sort((a, b) => {
      const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return tb - ta;
    });

    byCampaign.set(capId, {
      totalRaisedCents: base.totalRaisedCents + guestCents,
      sharedRecipientCount: base.sharedRecipientCount,
      paidRecipientCount: base.paidRecipientCount,
      contributors,
    });
  }

  return { ok: true, byCampaign };
}
