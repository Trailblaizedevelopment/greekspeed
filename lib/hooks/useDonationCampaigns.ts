'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DonationCampaign, DonationCampaignKind } from '@/types/donationCampaigns';

type ListResponse = { data: DonationCampaign[] };

export type CreateDonationCampaignPayload = {
  title: string;
  kind: DonationCampaignKind;
  /** Required for `fixed` — cents. */
  requestedAmountCents?: number;
  /** Required for `open` and `fundraiser` — cents (Crowded `goalAmount`). */
  goalAmountCents?: number;
  /** Crowded `showOnPublicFundraisingChannels` — only used for `fundraiser`. */
  showOnPublicFundraisingChannels?: boolean;
};

type CreateResponse = { data: DonationCampaign; error?: string; code?: string; issues?: unknown };

export function useDonationCampaigns(chapterId: string | null | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const cid = chapterId?.trim() ?? '';

  const listQuery = useQuery({
    queryKey: ['donation-campaigns', cid],
    queryFn: async (): Promise<DonationCampaign[]> => {
      const res = await fetch(`/api/chapters/${cid}/donations/campaigns`, {
        credentials: 'include',
      });
      const json = (await res.json()) as ListResponse | { error?: string };

      if (!res.ok) {
        const msg =
          typeof json === 'object' && json && 'error' in json && typeof json.error === 'string'
            ? json.error
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }

      return Array.isArray((json as ListResponse).data) ? (json as ListResponse).data : [];
    },
    enabled: Boolean(cid) && enabled,
    staleTime: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateDonationCampaignPayload): Promise<DonationCampaign> => {
      const body: Record<string, unknown> = {
        title: payload.title.trim(),
        kind: payload.kind,
      };
      if (payload.kind === 'fixed' && payload.requestedAmountCents != null) {
        body.requestedAmountCents = payload.requestedAmountCents;
      }
      if (payload.kind === 'open' || payload.kind === 'fundraiser') {
        if (payload.goalAmountCents != null) {
          body.goalAmountCents = payload.goalAmountCents;
        }
      }
      if (payload.kind === 'fundraiser' && payload.showOnPublicFundraisingChannels !== undefined) {
        body.showOnPublicFundraisingChannels = payload.showOnPublicFundraisingChannels;
      }

      const res = await fetch(`/api/chapters/${cid}/donations/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as CreateResponse;

      if (!res.ok) {
        const msg =
          typeof json.error === 'string'
            ? json.error
            : `Request failed (${res.status})`;
        const err = new Error(msg) as Error & { status?: number; code?: string; issues?: unknown };
        err.status = res.status;
        if (typeof json.code === 'string') err.code = json.code;
        if (json.issues !== undefined) err.issues = json.issues;
        throw err;
      }

      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['donation-campaigns', cid] });
    },
  });

  return { listQuery, createMutation };
}
