import type { CrowdedCreateCollectionRequest } from '@/types/crowded';

/**
 * Builds Crowded `POST …/chapters/:chapterId/collections` body under `data`.
 * Inferred from Crowded portal payloads (Apr 2026); **`goalAmount` is minor units (cents)** — confirm with Crowded if product amounts disagree.
 */
export function buildCrowdedDonationCollectionRequest(params: {
  kind: 'fixed' | 'open' | 'fundraiser';
  title: string;
  requestedAmountCents?: number;
  goalAmountCents?: number;
  showOnPublicFundraisingChannels?: boolean;
}): CrowdedCreateCollectionRequest {
  const title = params.title.trim();
  const currency = 'USD' as const;

  if (params.kind === 'fixed') {
    if (params.requestedAmountCents == null || params.requestedAmountCents < 1) {
      throw new Error('requestedAmountCents is required for fixed campaigns');
    }
    return {
      data: {
        title,
        currency,
        type: 'Payment',
        requestedAmount: params.requestedAmountCents,
        ...(params.goalAmountCents != null && params.goalAmountCents > 0
          ? { goalAmount: params.goalAmountCents }
          : {}),
      },
    };
  }

  if (params.kind === 'open') {
    if (params.goalAmountCents == null || params.goalAmountCents < 1) {
      throw new Error('goalAmountCents is required for open campaigns');
    }
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

  if (params.goalAmountCents == null || params.goalAmountCents < 1) {
    throw new Error('goalAmountCents is required for fundraiser campaigns');
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
