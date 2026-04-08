import type { CrowdedContact } from '@/types/crowded';

/** Profile fields used to match a Crowded contact (email + optional name tie-break). */
export interface CrowdedPayProfileForContactMatch {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
}

export function normalizeCrowdedPayEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

function profileDisplayFirstLast(p: CrowdedPayProfileForContactMatch): { first: string; last: string } {
  const fn = (p.first_name ?? '').trim().toLowerCase();
  const ln = (p.last_name ?? '').trim().toLowerCase();
  if (fn || ln) {
    return { first: fn, last: ln };
  }
  const full = (p.full_name ?? '').trim().toLowerCase();
  if (!full) {
    return { first: '', last: '' };
  }
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { first: parts[0] ?? '', last: '' };
  }
  return { first: parts[0] ?? '', last: parts[parts.length - 1] ?? '' };
}

function contactMatchesName(contact: CrowdedContact, p: CrowdedPayProfileForContactMatch): boolean {
  const { first, last } = profileDisplayFirstLast(p);
  if (!first && !last) {
    return true;
  }
  const cf = (contact.firstName ?? '').trim().toLowerCase();
  const cl = (contact.lastName ?? '').trim().toLowerCase();
  if (!first || !last) {
    return Boolean((first && cf === first) || (last && cl === last));
  }
  return cf === first && cl === last;
}

export type MatchCrowdedContactResult =
  | { ok: true; contactId: string }
  | { ok: false; reason: 'no_profile_email' | 'no_match' | 'ambiguous' };

/**
 * Resolve Crowded contact for checkout: email match on `listContacts` rows; name tie-break if multiple.
 */
export function matchCrowdedContactForProfile(
  contacts: CrowdedContact[],
  profile: CrowdedPayProfileForContactMatch
): MatchCrowdedContactResult {
  const want = normalizeCrowdedPayEmail(profile.email);
  if (!want) {
    return { ok: false, reason: 'no_profile_email' };
  }

  const byEmail = contacts.filter((c) => normalizeCrowdedPayEmail(c.email ?? null) === want);
  if (byEmail.length === 0) {
    return { ok: false, reason: 'no_match' };
  }
  if (byEmail.length === 1) {
    return { ok: true, contactId: byEmail[0].id };
  }

  const narrowed = byEmail.filter((c) => contactMatchesName(c, profile));
  if (narrowed.length === 1) {
    return { ok: true, contactId: narrowed[0].id };
  }
  return { ok: false, reason: 'ambiguous' };
}
