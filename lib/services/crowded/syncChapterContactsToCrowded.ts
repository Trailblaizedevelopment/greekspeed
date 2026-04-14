import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrowdedClient } from '@/lib/services/crowded/crowded-client';
import { CrowdedApiError, isCrowdedDebugSyncEnabled } from '@/lib/services/crowded/crowded-client';
import { normalizeCrowdedPayEmail } from '@/lib/services/crowded/matchCrowdedContactByProfile';
import type {
  CrowdedBulkCreateContactItem,
  CrowdedContactSyncSummary,
  CrowdedContactSyncUnverifiedIssue,
} from '@/types/crowded';

const CONTACT_PAGE_SIZE = 100;
const BULK_CREATE_CHUNK = 40;

export type SyncChapterContactsToCrowdedResult = CrowdedContactSyncSummary;

function splitFullName(full: string | null | undefined): { first: string; last: string } {
  const t = (full ?? '').trim();
  if (!t) return { first: '', last: '' };
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0] ?? '', last: '' };
  return { first: parts[0] ?? '', last: parts[parts.length - 1] ?? '' };
}

function profileToCrowdedNames(row: {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
}): { firstName: string; lastName: string } | null {
  const fn = (row.first_name ?? '').trim();
  const ln = (row.last_name ?? '').trim();
  if (fn || ln) {
    if (!fn || !ln) {
      return { firstName: fn || 'Member', lastName: ln || 'Member' };
    }
    return { firstName: fn, lastName: ln };
  }
  const { first, last } = splitFullName(row.full_name);
  if (!first && !last) return null;
  if (!last) return { firstName: first, lastName: 'Member' };
  return { firstName: first, lastName: last };
}

/** Best-effort E.164 for Crowded `mobile` when API requires it. */
export function normalizeProfilePhoneForCrowded(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.trim().startsWith('+') && digits.length >= 8) return raw.trim();
  return undefined;
}

async function listAllCrowdedContacts(
  crowded: CrowdedClient,
  crowdedChapterId: string
): Promise<import('@/types/crowded').CrowdedContact[]> {
  const out: import('@/types/crowded').CrowdedContact[] = [];
  let offset = 0;
  while (true) {
    const res = await crowded.listContacts(crowdedChapterId, {
      limit: CONTACT_PAGE_SIZE,
      offset,
    });
    out.push(...res.data);
    if (res.data.length === 0) break;
    const total = res.meta?.pagination?.total;
    if (typeof total === 'number' && out.length >= total) break;
    if (res.data.length < CONTACT_PAGE_SIZE) break;
    offset += CONTACT_PAGE_SIZE;
  }
  return out;
}

/**
 * Ensures Crowded chapter contacts exist for Trailblaize profiles (match by normalized email).
 * Idempotent: skips emails already present in Crowded.
 */
export async function syncChapterContactsToCrowded(params: {
  supabase: SupabaseClient;
  crowded: CrowdedClient;
  trailblaizeChapterId: string;
  crowdedChapterId: string;
  /** When set, only these profile ids (must belong to chapter). */
  memberIds?: string[] | null;
}): Promise<SyncChapterContactsToCrowdedResult> {
  const result: SyncChapterContactsToCrowdedResult = {
    alreadyInCrowded: 0,
    created: 0,
    skippedNoEmail: 0,
    skippedDuplicateEmailInProfiles: 0,
    skippedNoName: 0,
    errors: [],
    unverifiedCreates: [],
  };

  const existing = await listAllCrowdedContacts(params.crowded, params.crowdedChapterId);
  const crowdedEmails = new Set<string>();
  for (const c of existing) {
    const n = normalizeCrowdedPayEmail(c.email ?? null);
    if (n) crowdedEmails.add(n);
  }

  if (isCrowdedDebugSyncEnabled()) {
    console.info('[CROWDED_DEBUG_SYNC] syncChapterContactsToCrowded start', {
      trailblaizeChapterId: `${params.trailblaizeChapterId.slice(0, 8)}…`,
      crowdedChapterId: `${params.crowdedChapterId.slice(0, 8)}…`,
      memberIdsFilter: params.memberIds?.length ? params.memberIds : '(all chapter members)',
      crowdedContactCountFromApi: existing.length,
      crowdedDistinctEmails: crowdedEmails.size,
    });
  }

  let query = params.supabase
    .from('profiles')
    .select('id, chapter_id, email, first_name, last_name, full_name, phone')
    .eq('chapter_id', params.trailblaizeChapterId)
    .in('role', ['admin', 'active_member']);

  const ids = params.memberIds?.map((id) => id.trim()).filter(Boolean) ?? [];
  if (ids.length > 0) {
    query = query.in('id', [...new Set(ids)]);
  }

  const { data: profiles, error: profErr } = await query;
  if (profErr) {
    result.errors.push(profErr.message);
    return result;
  }

  const emailToProfiles = new Map<
    string,
    { id: string; email: string; first_name: string | null; last_name: string | null; full_name: string | null; phone: string | null }[]
  >();
  for (const row of profiles ?? []) {
    const emailNorm = normalizeCrowdedPayEmail(row.email as string | null);
    if (!emailNorm) {
      result.skippedNoEmail += 1;
      continue;
    }
    const list = emailToProfiles.get(emailNorm) ?? [];
    list.push({
      id: row.id as string,
      email: String(row.email).trim(),
      first_name: row.first_name as string | null,
      last_name: row.last_name as string | null,
      full_name: row.full_name as string | null,
      phone: (row as { phone?: string | null }).phone ?? null,
    });
    emailToProfiles.set(emailNorm, list);
  }

  const toCreateWithProfile: { profileId: string; item: CrowdedBulkCreateContactItem }[] = [];

  for (const [emailNorm, group] of emailToProfiles) {
    if (crowdedEmails.has(emailNorm)) {
      result.alreadyInCrowded += group.length;
      continue;
    }
    if (group.length > 1) {
      result.skippedDuplicateEmailInProfiles += group.length;
      result.errors.push(
        `Duplicate Trailblaize profiles share email ${emailNorm}; resolve before syncing to Crowded.`
      );
      continue;
    }
    const p = group[0];
    if (!p) continue;
    const names = profileToCrowdedNames(p);
    if (!names) {
      result.skippedNoName += 1;
      continue;
    }
    const item: CrowdedBulkCreateContactItem = {
      firstName: names.firstName,
      lastName: names.lastName,
      email: p.email,
    };
    const mobile = normalizeProfilePhoneForCrowded(p.phone);
    if (mobile) item.mobile = mobile;
    // `dateOfBirth` is supported by Crowded bulk create; add when profiles persist a DOB column.
    toCreateWithProfile.push({ profileId: p.id, item });
  }

  for (let i = 0; i < toCreateWithProfile.length; i += BULK_CREATE_CHUNK) {
    const chunkEntries = toCreateWithProfile.slice(i, i + BULK_CREATE_CHUNK);
    const chunk = chunkEntries.map((e) => e.item);
    try {
      if (isCrowdedDebugSyncEnabled()) {
        console.info('[CROWDED_DEBUG_SYNC] bulkCreate chunk', {
          chunkSize: chunk.length,
          payload: chunk.map((row) => ({
            email: row.email,
            firstName: row.firstName,
            lastName: row.lastName,
            hasMobile: Boolean(row.mobile),
          })),
        });
      }

      const res = await params.crowded.bulkCreateContacts(params.crowdedChapterId, { data: chunk });
      const returned = res.data?.length ?? 0;

      const refreshed = await listAllCrowdedContacts(params.crowded, params.crowdedChapterId);
      const refreshedEmails = new Set<string>();
      for (const c of refreshed) {
        const n = normalizeCrowdedPayEmail(c.email ?? null);
        if (n) refreshedEmails.add(n);
      }

      let verifiedThisChunk = 0;
      for (const entry of chunkEntries) {
        const want = normalizeCrowdedPayEmail(entry.item.email);
        if (want && refreshedEmails.has(want)) {
          verifiedThisChunk += 1;
          crowdedEmails.add(want);
        } else {
          const issue: CrowdedContactSyncUnverifiedIssue = {
            profileId: entry.profileId,
            email: entry.item.email,
            code: 'EMAIL_NOT_IN_LIST_AFTER_CREATE',
          };
          result.unverifiedCreates.push(issue);
        }
      }

      result.created += verifiedThisChunk;

      if (isCrowdedDebugSyncEnabled()) {
        const fromResponse = (res.data ?? []).map((c) => ({
          id: c.id,
          email: normalizeCrowdedPayEmail(c.email ?? null),
          rawEmail: c.email,
        }));
        console.info('[CROWDED_DEBUG_SYNC] bulkCreate parsed result', {
          returnedLength: returned,
          verifiedThisChunk,
          unverifiedThisChunk: chunkEntries.length - verifiedThisChunk,
          contactsFromResponse: fromResponse,
        });
        for (const row of chunk) {
          const want = normalizeCrowdedPayEmail(row.email);
          console.info('[CROWDED_DEBUG_SYNC] post-bulkCreate email present in listContacts?', {
            email: row.email,
            normalized: want,
            inListAfterCreate: Boolean(want && refreshedEmails.has(want)),
          });
        }
        console.info('[CROWDED_DEBUG_SYNC] listContacts totals after chunk', {
          contactRows: refreshed.length,
          distinctNormalizedEmails: refreshedEmails.size,
        });
      }
    } catch (e) {
      if (e instanceof CrowdedApiError) {
        result.errors.push(
          `Crowded bulk create (${chunk.length}): ${e.message}${e.details?.length ? ` — ${e.details.join('; ')}` : ''}`
        );
      } else {
        result.errors.push(`Crowded bulk create: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }
  }

  return result;
}
