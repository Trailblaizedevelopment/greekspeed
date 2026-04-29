import { normalizeCrowdedPayEmail } from '@/lib/services/crowded/matchCrowdedContactByProfile';
import {
  normalizeProfilePhoneForCrowded,
  profileToCrowdedNames,
} from '@/lib/services/crowded/syncChapterContactsToCrowded';

/**
 * Alumni who can be bulk-created as Crowded contacts (same baseline as sync + donation share).
 * Requires: role alumni, normalizable email, E.164-capable phone, and displayable first/last or full name.
 */
export function isProfileEligibleForAlumniCrowdedContact(profile: {
  role: string | null;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
}): boolean {
  if ((profile.role ?? '').trim() !== 'alumni') return false;
  if (!normalizeCrowdedPayEmail(profile.email)) return false;
  if (!normalizeProfilePhoneForCrowded(profile.phone)) return false;
  if (!profileToCrowdedNames(profile)) return false;
  return true;
}
