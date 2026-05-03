'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DonationCampaign, DonationCampaignCreateKind } from '@/types/donationCampaigns';

type ListResponse = { data: DonationCampaign[] };

export type CreateDonationCampaignPayload = {
  title: string;
  kind: DonationCampaignCreateKind;
  /** Cents — Crowded `goalAmount`. */
  goalAmountCents: number;
  /** Crowded `showOnPublicFundraisingChannels` — only for `fundraiser`. */
  showOnPublicFundraisingChannels?: boolean;
};

type CreateResponse = { data: DonationCampaign; error?: string; code?: string; issues?: unknown };

/** `recipientId` is only for per-row loading UI; the API uses `campaignId` from the URL. */
export type SyncDonationShareLinkVariables = { campaignId: string; recipientId: string };

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
        goalAmountCents: payload.goalAmountCents,
      };
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

  const syncShareLinkMutation = useMutation({
    mutationFn: async (
      vars: SyncDonationShareLinkVariables
    ): Promise<{
      crowdedShareUrl: string;
      alreadySet: boolean;
      source: 'collection' | 'intent' | 'stripe_checkout';
    }> => {
      const res = await fetch(`/api/chapters/${cid}/donations/campaigns/${vars.campaignId}/share-link`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ donationCampaignRecipientId: vars.recipientId }),
      });
      const json = (await res.json()) as {
        data?: {
          crowdedShareUrl: string;
          alreadySet: boolean;
          source?: 'collection' | 'intent' | 'stripe_checkout';
        };
        error?: string;
        code?: string;
      };

      if (!res.ok) {
        const msg =
          typeof json.error === 'string' ? json.error : `Request failed (${res.status})`;
        const err = new Error(msg) as Error & { status?: number; code?: string };
        err.status = res.status;
        if (typeof json.code === 'string') err.code = json.code;
        throw err;
      }

      if (!json.data?.crowdedShareUrl) {
        throw new Error('Invalid response from server');
      }

      const src = json.data.source;
      const source: 'collection' | 'intent' | 'stripe_checkout' =
        src === 'intent' ? 'intent' : src === 'stripe_checkout' ? 'stripe_checkout' : 'collection';

      return {
        crowdedShareUrl: json.data.crowdedShareUrl,
        alreadySet: Boolean(json.data.alreadySet),
        source,
      };
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['donation-campaigns', cid] });
      void queryClient.invalidateQueries({ queryKey: ['my-donation-campaign-shares'] });
      void queryClient.invalidateQueries({ queryKey: ['donation-recipients', cid, vars.campaignId] });
    },
  });

  return { listQuery, createMutation, syncShareLinkMutation };
}
