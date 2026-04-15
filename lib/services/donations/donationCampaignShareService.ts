import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrowdedClient } from '@/lib/services/crowded/crowded-client';
import {
  matchCrowdedContactForProfile,
  type CrowdedPayProfileForContactMatch,
} from '@/lib/services/crowded/matchCrowdedContactByProfile';
import type { CrowdedContact } from '@/types/crowded';
import type {
  DonationCampaignRecipientRow,
  DonationShareCandidate,
} from '@/types/donationCampaignRecipients';

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
 * Chapter members who already have a resolvable Crowded contact (same rules as dues checkout).
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
    .select('id, email, first_name, last_name, full_name, avatar_url')
    .eq('chapter_id', params.trailblaizeChapterId)
    .in('role', ['admin', 'active_member'])
    .order('full_name');

  if (membersError) {
    return { ok: false, error: membersError.message || 'Failed to load members' };
  }

  const candidates: DonationShareCandidate[] = [];

  for (const m of members ?? []) {
    const profile: CrowdedPayProfileForContactMatch = {
      email: m.email as string | null,
      first_name: m.first_name as string | null,
      last_name: m.last_name as string | null,
      full_name: m.full_name as string | null,
    };
    const match = matchCrowdedContactForProfile(contacts, profile);
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
    });
  }

  return { ok: true, candidates };
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
    .select('id, donation_campaign_id, profile_id, crowded_contact_id, created_at')
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
      crowded_contact_id: raw.crowded_contact_id as string,
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

  const contacts = await listAllCrowdedContacts(params.crowded, params.crowdedChapterId);

  const { data: profiles, error: profErr } = await params.supabase
    .from('profiles')
    .select('id, chapter_id, email, first_name, last_name, full_name')
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
    const match = matchCrowdedContactForProfile(contacts, {
      email: p.email as string | null,
      first_name: p.first_name as string | null,
      last_name: p.last_name as string | null,
      full_name: p.full_name as string | null,
    });
    if (!match.ok) {
      return {
        ok: false,
        error:
          'One or more selected members do not have a Crowded contact (sync contacts or fix profile email).',
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
