export type CrowdedChapterBalanceAccountRow = {
  crowdedAccountId: string;
  displayName: string;
  balanceUsd: number;
  currency: string | null;
};

/** GET `/api/chapters/:id/crowded/balance` JSON body */
export type CrowdedChapterBalanceApiResponse =
  | {
      ok: true;
      data: {
        balanceUsd: number;
        totalBalanceMinor: number;
        syncedAt: string;
        accountCount: number;
        accounts: CrowdedChapterBalanceAccountRow[];
        dbSyncError: string | null;
      };
    }
  | { ok: false; code: 'no_customer'; message: string }
  | { ok: false; code: 'api_error'; message: string; statusCode?: number };
