export type CrowdedRecentTransactionRow = {
  crowdedTransactionId: string;
  crowdedAccountId: string;
  description: string;
  status: string | null;
  amountMinor: number | null;
  amountUsd: number | null;
  currency: string | null;
  effectiveAt: string;
  postedAt: string | null;
  occurredAt: string | null;
  syncedAt: string;
};

export type CrowdedRecentTransactionsApiResponse =
  | {
      ok: true;
      data: {
        transactions: CrowdedRecentTransactionRow[];
      };
    }
  | {
      ok: false;
      error: string;
      code?: string;
    };
