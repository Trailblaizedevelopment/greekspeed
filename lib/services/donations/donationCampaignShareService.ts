import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DonationCampaignRecipientRow,
  DonationShareCandidate,
} from '@/types/donationCampaignRecipients';
import type { DonationCampaignPublicPaymentRow } from '@/types/donationCampaignPublicPayments';
import { isDonationCampaignStripeDrive } from '@/types/donationCampaigns';

function displayNameFromProfile(p: {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
}): string {
  const fn = (p.first_name ?? '').trim();
  const ln = (p.last_name ?? '').trim();
  if (fn || ln) {
    return [fn, ln].filter(Boolean).join(' ').trim() || 'Member';
  }
  const full = (p.full_name ?? '').trim();
  return full || 'Member';
}

export async function getDonationCampaignForChapter(
  supabase: SupabaseClient,
  donationCampaignId: string,
  trailblaizeChapterId: string
): Promise<{ id: string; chapter_id: string; title: string } | null> {
  const { data, error } = await supabase
    .from('donation_campaigns')
    .select('id, chapter_id, title')
    .eq('id', donationCampaignId)
    .eq('chapter_id', trailblaizeChapterId)
    .maybeSingle();

  if (error || !data) return null;
  return data as { id: string; chapter_id: string; title: string };
}

/**
 * Share picker: chapter admins/actives and alumni (no external contact sync required).
 */
export async function listDonationShareCandidates(params: {
  supabase: SupabaseClient;
  trailblaizeChapterId: string;
  donationCampaignId: string;
}): Promise<{ ok: true; candidates: DonationShareCandidate[] } | { ok: false; error: string }> {
  const { data: campaign, error: cErr } = await params.supabase
    .from('donation_campaigns')
    .select('id, chapter_id, stripe_price_id, crowded_collection_id')
    .eq('id', params.donationCampaignId)
    .eq('chapter_id', params.trailblaizeChapterId)
    .maybeSingle();

  if (cErr || !campaign) {
    return { ok: false, error: 'Donation campaign not found' };
  }

  if (!isDonationCampaignStripeDrive(campaign)) {
    return {
      ok: false,
      error:
        'This donation is not Stripe-backed. Legacy Crowded-backed donations are no longer supported in Trailblaize.',
    };
  }

  const { data: members, error: membersError } = await params.supabase
    .from('profiles')
    .select('id, email, first_name, last_name, full_name, avatar_url, role')
    .eq('chapter_id', params.trailblaizeChapterId)
    .in('role', ['admin', 'active_member'])
    .order('full_name');

  if (membersError) {
    return { ok: false, error: membersError.message || 'Failed to load members' };
  }

  const candidates: DonationShareCandidate[] = (members ?? []).map((m) => ({
    profileId: m.id as string,
    contactId: null,
    email: (m.email as string | null) ?? null,
    displayName: displayNameFromProfile({
      first_name: m.first_name as string | null,
      last_name: m.last_name as string | null,
      full_name: m.full_name as string | null,
    }),
    avatarUrl: (m.avatar_url as string | null) ?? null,
    isAlumni: false,
    pendingCrowdedContact: false,
  }));

  const { data: alumniRows, error: alumniErr } = await params.supabase
    .from('profiles')
    .select('id, email, first_name, last_name, full_name, avatar_url, role')
    .eq('chapter_id', params.trailblaizeChapterId)
    .eq('role', 'alumni')
    .order('full_name');

  if (alumniErr) {
    return { ok: false, error: alumniErr.message || 'Failed to load alumni' };
  }

  const seenAlumniEmails = new Set<string>();
  for (const m of alumniRows ?? []) {
    const emailNorm = typeof m.email === 'string' ? m.email.trim().toLowerCase() : '';
    if (emailNorm) {
      if (seenAlumniEmails.has(emailNorm)) continue;
      seenAlumniEmails.add(emailNorm);
    }

    candidates.push({
      profileId: m.id as string,
      contactId: null,
      email: (m.email as string | null) ?? null,
      displayName: displayNameFromProfile({
        first_name: m.first_name as string | null,
        last_name: m.last_name as string | null,
        full_name: m.full_name as string | null,
      }),
      avatarUrl: (m.avatar_url as string | null) ?? null,
      isAlumni: true,
      pendingCrowdedContact: false,
    });
  }

  candidates.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

  return { ok: true, candidates };
}

export async function addDonationCampaignRecipients(params: {
  supabase: SupabaseClient;
  trailblaizeChapterId: string;
  donationCampaignId: string;
  profileIds: string[];
}): Promise<{ ok: true; saved: number } | { ok: false; error: string; code?: string }> {
  const { data: campaign, error: cErr } = await params.supabase
    .from('donation_campaigns')
    .select('id, chapter_id, stripe_price_id, crowded_collection_id')
    .eq('id', params.donationCampaignId)
    .eq('chapter_id', params.trailblaizeChapterId)
    .maybeSingle();

  if (cErr || !campaign) {
    return { ok: false, error: 'Donation campaign not found', code: 'NOT_FOUND' };
  }

  if (!isDonationCampaignStripeDrive(campaign)) {
    return {
      ok: false,
      error:
        'This donation is not Stripe-backed. Legacy Crowded-backed donations are no longer supported.',
      code: 'NOT_FOUND',
    };
  }

  const ids = [...new Set(params.profileIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: false, error: 'No members selected', code: 'EMPTY_SELECTION' };
  }

  const { data: profiles, error: profErr } = await params.supabase
    .from('profiles')
    .select('id, chapter_id')
    .eq('chapter_id', params.trailblaizeChapterId)
    .in('id', ids);

  if (profErr || !profiles || profiles.length === 0) {
    return { ok: false, error: 'No valid chapter members for selection', code: 'INVALID_MEMBERS' };
  }

  if (profiles.length !== ids.length) {
    return { ok: false, error: 'One or more selected members are not in this chapter', code: 'INVALID_MEMBERS' };
  }

  const rows = profiles.map((p) => ({
    donation_campaign_id: params.donationCampaignId,
    profile_id: p.id as string,
    crowded_contact_id: null as string | null,
  }));

  const { data: savedRows, error: insErr } = await params.supabase
    .from('donation_campaign_recipients')
    .upsert(rows, { onConflict: 'donation_campaign_id,profile_id' })
    .select('id');

  if (insErr) {
    return { ok: false, error: insErr.message || 'Failed to save recipients' };
  }

  return { ok: true, saved: savedRows?.length ?? 0 };
}

export type DonationCampaignRecipientsListPayload = {
  recipients: DonationCampaignRecipientRow[];
  /** Stripe Payment Link (public / chapter hub) guest checkouts for this campaign. */
  publicPayments: DonationCampaignPublicPaymentRow[];
  publicPaymentTotalCents: number;
};

export async function listDonationCampaignRecipients(params: {
  supabase: SupabaseClient;
  donationCampaignId: string;
  trailblaizeChapterId: string;
}): Promise<{ ok: true; data: DonationCampaignRecipientsListPayload } | { ok: false; error: string }> {
  const { data: campaignRow, error: cErr } = await params.supabase
    .from('donation_campaigns')
    .select('id, chapter_id, title, stripe_price_id, crowded_collection_id')
    .eq('id', params.donationCampaignId)
    .eq('chapter_id', params.trailblaizeChapterId)
    .maybeSingle();

  if (cErr || !campaignRow) {
    return { ok: false, error: 'Donation campaign not found' };
  }

  if (!isDonationCampaignStripeDrive(campaignRow)) {
    return {
      ok: false,
      error:
        'This donation is not Stripe-backed. Legacy Crowded-backed donations are no longer supported.',
    };
  }

  const { data: recs, error } = await params.supabase
    .from('donation_campaign_recipients')
    .select(
      'id, donation_campaign_id, profile_id, crowded_contact_id, crowded_checkout_url, stripe_checkout_url, stripe_checkout_session_id, amount_paid_cents, paid_at, created_at'
    )
    .eq('donation_campaign_id', params.donationCampaignId)
    .order('created_at', { ascending: true });

  if (error) {
    return { ok: false, error: error.message || 'Failed to load recipients' };
  }

  const list = recs ?? [];
  const profileIds = list.map((r) => r.profile_id as string).filter(Boolean);
  let profileMap = new Map<
    string,
    { first_name: string | null; last_name: string | null; full_name: string | null; email: string | null; avatar_url: string | null }
  >();

  if (profileIds.length > 0) {
    const { data: profs, error: pErr } = await params.supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, email, avatar_url')
      .in('id', profileIds);

    if (!pErr && profs) {
      profileMap = new Map(
        profs.map((p) => [
          p.id as string,
          {
            first_name: p.first_name as string | null,
            last_name: p.last_name as string | null,
            full_name: p.full_name as string | null,
            email: p.email as string | null,
            avatar_url: p.avatar_url as string | null,
          },
        ])
      );
    }
  }

  const recipientRows: DonationCampaignRecipientRow[] = list.map((raw) => {
    const pid = raw.profile_id as string;
    const prof = profileMap.get(pid);
    return {
      id: raw.id as string,
      donation_campaign_id: raw.donation_campaign_id as string,
      profile_id: pid,
      crowded_contact_id: (raw.crowded_contact_id as string | null | undefined) ?? null,
      crowded_checkout_url: (raw.crowded_checkout_url as string | null | undefined) ?? null,
      stripe_checkout_url: (raw.stripe_checkout_url as string | null | undefined) ?? null,
      stripe_checkout_session_id: (raw.stripe_checkout_session_id as string | null | undefined) ?? null,
      amount_paid_cents: (raw.amount_paid_cents as number | null | undefined) ?? null,
      paid_at: (raw.paid_at as string | null | undefined) ?? null,
      created_at: raw.created_at as string,
      profile: {
        id: pid,
        first_name: prof?.first_name ?? null,
        last_name: prof?.last_name ?? null,
        full_name: prof?.full_name ?? null,
        email: prof?.email ?? null,
        avatar_url: prof?.avatar_url ?? null,
      },
    };
  });

  const { data: publicRaw, error: pubErr } = await params.supabase
    .from('donation_campaign_public_payments')
    .select('id, donation_campaign_id, stripe_checkout_session_id, amount_paid_cents, paid_at, payer_email, created_at')
    .eq('donation_campaign_id', params.donationCampaignId)
    .order('paid_at', { ascending: false });

  if (pubErr) {
    return { ok: false, error: pubErr.message || 'Failed to load public payments' };
  }

  const publicPayments = (publicRaw ?? []) as DonationCampaignPublicPaymentRow[];
  const publicPaymentTotalCents = publicPayments.reduce(
    (s, p) => s + Math.max(0, Math.floor(Number(p.amount_paid_cents) || 0)),
    0
  );

  return {
    ok: true,
    data: {
      recipients: recipientRows,
      publicPayments,
      publicPaymentTotalCents,
    },
  };
}
