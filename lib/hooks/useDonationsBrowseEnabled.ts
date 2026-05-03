'use client';

import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';

/** Crowded-backed drives and/or Stripe chapter donations (Dues panel). */
export function useDonationsBrowseEnabled(): boolean {
  const { enabled: crowded } = useFeatureFlag('crowded_integration_enabled');
  const { enabled: financial } = useFeatureFlag('financial_tools_enabled');
  const { enabled: stripeDonations } = useFeatureFlag('stripe_donations_enabled');
  return Boolean(crowded || (financial && stripeDonations));
}
