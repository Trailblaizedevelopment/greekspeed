import type { CrowdedCreateCollectionRequest } from '@/types/crowded';
import type { DonationCampaignCreateKind } from '@/types/donationCampaigns';

/**
 * Builds Crowded `POST …/chapters/:chapterId/collections` body under `data`.
 * Donation drives: **`open`** or **`fundraiser`** only. **`goalAmount` is minor units (cents)**.
 */
export function buildCrowdedDonationCollectionRequest(params: {
  kind: DonationCampaignCreateKind;
  title: string;
  goalAmountCents: number;
  showOnPublicFundraisingChannels?: boolean;
}): CrowdedCreateCollectionRequest {
  const title = params.title.trim();
  const currency = 'USD' as const;

  if (params.goalAmountCents == null || params.goalAmountCents < 1) {
    throw new Error('goalAmountCents is required');
  }

  if (params.kind === 'open') {
    return {
      data: {
        title,
        currency,
        type: 'Payment',
        // Omit `requestedAmount` — Crowded POST rejects `null` ("must be a number"); open amount uses goal only.
        goalAmount: params.goalAmountCents,
        installmentsAvailable: true,
        orgPassedOnFees: false,
        orgAlwaysPaysFees: false,
        showOnPublicFundraisingChannels: false,
      },
    };
  }

  return {
    data: {
      title,
      currency,
      type: 'Fundraising',
      goalAmount: params.goalAmountCents,
      showOnPublicFundraisingChannels: params.showOnPublicFundraisingChannels ?? true,
      installmentsAvailable: true,
      orgPassedOnFees: false,
      orgAlwaysPaysFees: false,
    },
  };
}
