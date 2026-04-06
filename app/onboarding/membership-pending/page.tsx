import { redirect } from 'next/navigation';

/** TRA-581: Legacy URL from TRA-580 — forward to canonical pending approval route. */
export default function MembershipPendingRedirectPage() {
  redirect('/onboarding/pending-chapter-approval');
}
