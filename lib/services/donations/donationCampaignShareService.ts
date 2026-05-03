import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrowdedClient } from '@/lib/services/crowded/crowded-client';
import { CrowdedApiError } from '@/lib/services/crowded/crowded-client';
import {
  matchCrowdedContactForProfile,
  type CrowdedPayProfileForContactMatch,
} from '@/lib/services/crowded/matchCrowdedContactByProfile';
import {
  normalizeProfilePhoneForCrowded,
  profileToCrowdedNames,
} from '@/lib/services/crowded/syncChapterContactsToCrowded';
import type { CrowdedBulkCreateContactItem, CrowdedContact } from '@/types/crowded';
import type {
  DonationCampaignRecipientRow,
  DonationShareCandidate,
} from '@/types/donationCampaignRecipients';
import { isDonationCampaignStripeDrive } from '@/types/donationCampaigns';
import { isProfileEligibleForAlumniCrowdedContact } from '@/lib/services/donations/alumniCrowdedContactEligibility';

const CONTACT_PAGE_SIZE = 100;

async function listAllCrowdedContacts(
  crowded: CrowdedClient,
  crowdedChapterId: string
): Promise<CrowdedContact[]> {
  const contacts: CrowdedContact[] = [];
  let offset = 0;

  while (true) {
    const response = await crowded.listContacts(crowdedChapterId, {
      limit: CONTACT_PAGE_SIZE,
      offset,
    });
    contacts.push(...response.data);
    if (response.data.length === 0) break;

    const total = response.meta?.pagination?.total;
    if (typeof total === 'number' && contacts.length >= total) break;
    if (response.data.length < CONTACT_PAGE_SIZE) break;
    offset += CONTACT_PAGE_SIZE;
  }

  return contacts;
}

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

function profileRowToMatchPayload(m: {
  email: unknown;
  first_name: unknown;
  last_name: unknown;
  full_name: unknown;
}): CrowdedPayProfileForContactMatch {
  return {
    email: m.email as string | null,
    first_name: m.first_name as string | null,
    last_name: m.last_name as string | null,
    full_name: m.full_name as string | null,
  };
}

/**
 * Creates a Crowded contact for an eligible alumni profile and returns refreshed contacts list.
 */
async function createCrowdedContactForEligibleAlumni(params: {
  crowded: CrowdedClient;
  crowdedChapterId: string;
  profile: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    phone: string | null;
    role: string | null;
  };
}): Promise<{ ok: true; contacts: CrowdedContact[] } | { ok: false; error: string }> {
  if (!isProfileEligibleForAlumniCrowdedContact(params.profile)) {
    return {
      ok: false,
      error:
        'Alumni must have a valid email, E.164-capable phone on their profile, and first/last or full name before creating a Crowded contact.',
    };
  }
  const names = profileToCrowdedNames(params.profile);
  if (!names) {
    return { ok: false, error: 'Could not derive Crowded first/last name from profile.' };
  }
  const item: CrowdedBulkCreateContactItem = {
    firstName: names.firstName,
    lastName: names.lastName,
    email: String(params.profile.email).trim(),
  };
  const mobile = normalizeProfilePhoneForCrowded(params.profile.phone);
  if (mobile) item.mobile = mobile;

  try {
    await params.crowded.bulkCreateContacts(params.crowdedChapterId, { data: [item] });
  } catch (e) {
    if (e instanceof CrowdedApiError) {
      const detail =
        Array.isArray(e.details) && e.details.length
          ? ` — ${e.details.map(String).join('; ')}`
          : '';
      return { ok: false, error: `Crowded could not create contact: ${e.message}${detail}` };
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Crowded contact create failed' };
  }

  const contacts = await listAllCrowdedContacts(params.crowded, params.crowdedChapterId);
  return { ok: true, contacts };
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
 * Share picker: chapter admins/actives with a Crowded match, plus **eligible alumni**
 * (email + E.164 phone + name). Alumni without a Crowded row appear with `pendingCrowdedContact: true`.
 */
export async function listDonationShareCandidates(params: {
  supabase: SupabaseClient;
  crowded: CrowdedClient;
  trailblaizeChapterId: string;
  crowdedChapterId: string;
  donationCampaignId: string;
}): Promise<{ ok: true; candidates: DonationShareCandidate[] } | { ok: false; error: string }> {
  const campaign = await getDonationCampaignForChapter(
    params.supabase,
    params.donationCampaignId,
    params.trailblaizeChapterId
  );
  if (!campaign) {
    return { ok: false, error: 'Donation campaign not found' };
  }

  const contacts = await listAllCrowdedContacts(params.crowded, params.crowdedChapterId);

  const { data: members, error: membersError } = await params.supabase
    .from('profiles')
    .select('id, email, first_name, last_name, full_name, avatar_url, role, phone')
    .eq('chapter_id', params.trailblaizeChapterId)
    .in('role', ['admin', 'active_member'])
    .order('full_name');

  if (membersError) {
    return { ok: false, error: membersError.message || 'Failed to load members' };
  }

  const candidates: DonationShareCandidate[] = [];

  for (const m of members ?? []) {
    const match = matchCrowdedContactForProfile(contacts, profileRowToMatchPayload(m));
    if (!match.ok) continue;

    candidates.push({
      profileId: m.id as string,
      contactId: match.contactId,
      email: (m.email as string | null) ?? null,
      displayName: displayNameFromProfile({
        first_name: m.first_name as string | null,
        last_name: m.last_name as string | null,
        full_name: m.full_name as string | null,
      }),
      avatarUrl: (m.avatar_url as string | null) ?? null,
      isAlumni: false,
      pendingCrowdedContact: false,
    });
  }

  const { data: alumniRows, error: alumniErr } = await params.supabase
    .from('profiles')
    .select('id, email, first_name, last_name, full_name, avatar_url, role, phone')
    .eq('chapter_id', params.trailblaizeChapterId)
    .eq('role', 'alumni')
    .order('full_name');

  if (alumniErr) {
    return { ok: false, error: alumniErr.message || 'Failed to load alumni' };
  }

  const seenAlumniEmails = new Set<string>();
  for (const m of alumniRows ?? []) {
    if (
      !isProfileEligibleForAlumniCrowdedContact({
        role: m.role as string | null,
        email: m.email as string | null,
        phone: (m.phone as string | null) ?? null,
        first_name: m.first_name as string | null,
        last_name: m.last_name as string | null,
        full_name: m.full_name as string | null,
      })
    ) {
      continue;
    }

    const emailNorm =
      typeof m.email === 'string' ? m.email.trim().toLowerCase() : '';
    if (emailNorm) {
      if (seenAlumniEmails.has(emailNorm)) continue;
      seenAlumniEmails.add(emailNorm);
    }

    const matchPayload = profileRowToMatchPayload(m);
    const match = matchCrowdedContactForProfile(contacts, matchPayload);

    candidates.push({
      profileId: m.id as string,
      contactId: match.ok ? match.contactId : null,
      email: (m.email as string | null) ?? null,
      displayName: displayNameFromProfile({
        first_name: m.first_name as string | null,
        last_name: m.last_name as string | null,
        full_name: m.full_name as string | null,
      }),
      avatarUrl: (m.avatar_url as string | null) ?? null,
      isAlumni: true,
      pendingCrowdedContact: !match.ok,
    });
  }

  candidates.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

  return { ok: true, candidates };
}

/**
 * Share picker for **Stripe-backed** drives: all chapter actives/admins and alumni (no Crowded contact required).
 */
export async function listDonationShareCandidatesForStripeCampaign(params: {
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
    return { ok: false, error: 'This drive is not a Stripe-backed campaign' };
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
    const emailNorm =
      typeof m.email === 'string' ? m.email.trim().toLowerCase() : '';
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

export async function addDonationCampaignRecipientsForStripeCampaign(params: {
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
    return { ok: false, error: 'This drive is not a Stripe-backed campaign', code: 'NOT_FOUND' };
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

export async function listDonationCampaignRecipients(params: {
  supabase: SupabaseClient;
  donationCampaignId: string;
  trailblaizeChapterId: string;
}): Promise<{ ok: true; rows: DonationCampaignRecipientRow[] } | { ok: false; error: string }> {
  const campaign = await getDonationCampaignForChapter(
    params.supabase,
    params.donationCampaignId,
    params.trailblaizeChapterId
  );
  if (!campaign) {
    return { ok: false, error: 'Donation campaign not found' };
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

  const rows: DonationCampaignRecipientRow[] = list.map((raw) => {
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

  return { ok: true, rows };
}

export async function addDonationCampaignRecipients(params: {
  supabase: SupabaseClient;
  crowded: CrowdedClient;
  trailblaizeChapterId: string;
  crowdedChapterId: string;
  donationCampaignId: string;
  profileIds: string[];
}): Promise<{ ok: true; saved: number } | { ok: false; error: string; code?: string }> {
  const campaign = await getDonationCampaignForChapter(
    params.supabase,
    params.donationCampaignId,
    params.trailblaizeChapterId
  );
  if (!campaign) {
    return { ok: false, error: 'Donation campaign not found', code: 'NOT_FOUND' };
  }

  const ids = [...new Set(params.profileIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: false, error: 'No members selected', code: 'EMPTY_SELECTION' };
  }

  let contacts = await listAllCrowdedContacts(params.crowded, params.crowdedChapterId);

  const { data: profiles, error: profErr } = await params.supabase
    .from('profiles')
    .select('id, chapter_id, email, first_name, last_name, full_name, phone, role')
    .eq('chapter_id', params.trailblaizeChapterId)
    .in('id', ids);

  if (profErr || !profiles || profiles.length === 0) {
    return { ok: false, error: 'No valid chapter members for selection', code: 'INVALID_MEMBERS' };
  }

  if (profiles.length !== ids.length) {
    return { ok: false, error: 'One or more selected members are not in this chapter', code: 'INVALID_MEMBERS' };
  }

  const rows: { donation_campaign_id: string; profile_id: string; crowded_contact_id: string }[] = [];

  for (const p of profiles) {
    const role = (p.role as string | null)?.trim() ?? '';
    const matchPayload = profileRowToMatchPayload(p);
    let match = matchCrowdedContactForProfile(contacts, matchPayload);

    if (!match.ok) {
      if (
        role === 'alumni' &&
        isProfileEligibleForAlumniCrowdedContact({
          role: p.role as string | null,
          email: p.email as string | null,
          phone: (p.phone as string | null) ?? null,
          first_name: p.first_name as string | null,
          last_name: p.last_name as string | null,
          full_name: p.full_name as string | null,
        })
      ) {
        const created = await createCrowdedContactForEligibleAlumni({
          crowded: params.crowded,
          crowdedChapterId: params.crowdedChapterId,
          profile: {
            id: p.id as string,
            email: p.email as string | null,
            first_name: p.first_name as string | null,
            last_name: p.last_name as string | null,
            full_name: p.full_name as string | null,
            phone: (p.phone as string | null) ?? null,
            role: p.role as string | null,
          },
        });
        if (!created.ok) {
          return {
            ok: false,
            error: created.error,
            code: 'CROWDED_CONTACT_CREATE_FAILED',
          };
        }
        contacts = created.contacts;
        match = matchCrowdedContactForProfile(contacts, matchPayload);
      }
    }

    if (!match.ok) {
      return {
        ok: false,
        error:
          role === 'alumni'
            ? 'Could not link this alumni member to Crowded after creating a contact. Check Crowded for duplicate email/mobile or try contact sync.'
            : 'One or more selected members do not have a Crowded contact (sync contacts or fix profile email).',
        code: 'CONTACT_NOT_MATCHED',
      };
    }

    rows.push({
      donation_campaign_id: params.donationCampaignId,
      profile_id: p.id as string,
      crowded_contact_id: match.contactId,
    });
  }

  const { data: savedRows, error: insErr } = await params.supabase
    .from('donation_campaign_recipients')
    .upsert(rows, { onConflict: 'donation_campaign_id,profile_id' })
    .select('id');

  if (insErr) {
    return { ok: false, error: insErr.message || 'Failed to save recipients' };
  }

  return { ok: true, saved: savedRows?.length ?? 0 };
}
