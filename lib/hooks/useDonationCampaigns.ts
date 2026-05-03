'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DonationCampaign, DonationCampaignCreateKind } from '@/types/donationCampaigns';

type ListResponse = { data: DonationCampaign[] };

export type CreateDonationCampaignPayload = {
  title: string;
  kind: DonationCampaignCreateKind;
  /** Cents — goal cap for open donations; fixed amount for fundraiser. */
  goalAmountCents: number;
  /** Stored in campaign metadata for `fundraiser`; ignored for `open`. */
  showOnPublicFundraisingChannels?: boolean;
  /** Optional; stored on `donation_campaigns` and Stripe Product when using Connect. */
  description?: string;
  /** Public https URL; stored on `donation_campaigns` and Stripe Product.images when using Connect. */
  heroImageUrl?: string;
};

type CreateResponse = { data: DonationCampaign; error?: string; code?: string; issues?: unknown };

export type UpdateDonationChapterHubVisibleVariables = {
  campaignId: string;
  chapterHubVisible: boolean;
};

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
      const d = payload.description?.trim();
      if (d) body.description = d;
      const h = payload.heroImageUrl?.trim();
      if (h) body.heroImageUrl = h;

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
      void queryClient.invalidateQueries({ queryKey: ['chapter-donation-browse', cid] });
    },
  });

  const updateChapterHubVisibleMutation = useMutation({
    mutationFn: async (vars: UpdateDonationChapterHubVisibleVariables): Promise<void> => {
      const res = await fetch(`/api/chapters/${cid}/donations/campaigns/${vars.campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chapterHubVisible: vars.chapterHubVisible }),
      });
      const json = (await res.json()) as { error?: string };

      if (!res.ok) {
        const msg =
          typeof json.error === 'string' ? json.error : `Request failed (${res.status})`;
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['donation-campaigns', cid] });
      void queryClient.invalidateQueries({ queryKey: ['chapter-donation-browse', cid] });
    },
  });

  return { listQuery, createMutation, updateChapterHubVisibleMutation };
}
