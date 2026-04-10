/** GET `/api/chapters/:chapterId/crowded/collections/:collectionId/overview` */
export type CrowdedContactMatchReason =
  | 'matched'
  | 'no_profile_email'
  | 'no_match'
  | 'ambiguous';

export interface CrowdedCollectOverviewRow {
  assignmentId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  memberStatus: string | null;
  amountAssessed: number;
  amountDue: number;
  amountPaid: number;
  trailblaizeStatus: string;
  crowdedContact: {
    state: CrowdedContactMatchReason;
    contactId?: string;
  };
  crowdedIntent: {
    id: string;
    status: string;
    requestedAmountMinor: number;
    paidAmountMinor: number;
    paymentUrl?: string | null;
    createdAt?: string | null;
  } | null;
}

export interface CrowdedCollectOverviewApiOk {
  ok: true;
  data: {
    duesCycleId: string;
    duesCycleName: string;
    collectionId: string;
    collectionFromCrowded: {
      id: string;
      title: string;
      requestedAmountMinor: number;
      createdAt: string;
    } | null;
    collectionCrowdedError: string | null;
    intentsListAvailable: boolean;
    intentsCrowdedError: string | null;
    collectPublicBaseUrl: string | null;
    rows: CrowdedCollectOverviewRow[];
    summary: {
      assignmentCount: number;
      trailblaizeTotalPaidUsd: number;
      trailblaizeTotalDueUsd: number;
      crowdedMatchedContacts: number;
      intentsWithCrowdedStatus: number;
    };
  };
}

export interface CrowdedCollectOverviewApiErr {
  ok: false;
  error: string;
  code?: string;
}

export type CrowdedCollectOverviewApiResponse = CrowdedCollectOverviewApiOk | CrowdedCollectOverviewApiErr;
