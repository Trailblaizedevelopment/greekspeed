'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DonationCampaignRecipientRow, DonationShareCandidate } from '@/types/donationCampaignRecipients';

type CandidatesResponse = { data: DonationShareCandidate[] };
type RecipientsResponse = { data: DonationCampaignRecipientRow[] };
type ShareResponse = { data: { saved: number }; error?: string; code?: string; issues?: unknown };

export function useDonationShareCandidates(
  chapterId: string | undefined,
  campaignId: string | null,
  enabled: boolean
) {
  const cid = chapterId?.trim() ?? '';
  const cap = campaignId?.trim() ?? '';

  return useQuery({
    queryKey: ['donation-share-candidates', cid, cap],
    queryFn: async (): Promise<DonationShareCandidate[]> => {
      const res = await fetch(
        `/api/chapters/${cid}/donations/campaigns/${cap}/share-candidates`,
        { credentials: 'include' }
      );
      const json = (await res.json()) as CandidatesResponse | { error?: string };
      if (!res.ok) {
        const msg =
          typeof json === 'object' && json && 'error' in json && typeof json.error === 'string'
            ? json.error
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      return Array.isArray((json as CandidatesResponse).data) ? (json as CandidatesResponse).data : [];
    },
    enabled: Boolean(cid) && Boolean(cap) && enabled,
    staleTime: 30_000,
  });
}

export function useDonationRecipients(
  chapterId: string | undefined,
  campaignId: string | null,
  enabled: boolean
) {
  const cid = chapterId?.trim() ?? '';
  const cap = campaignId?.trim() ?? '';

  return useQuery({
    queryKey: ['donation-recipients', cid, cap],
    queryFn: async (): Promise<DonationCampaignRecipientRow[]> => {
      const res = await fetch(`/api/chapters/${cid}/donations/campaigns/${cap}/recipients`, {
        credentials: 'include',
      });
      const json = (await res.json()) as RecipientsResponse | { error?: string };
      if (!res.ok) {
        const msg =
          typeof json === 'object' && json && 'error' in json && typeof json.error === 'string'
            ? json.error
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      return Array.isArray((json as RecipientsResponse).data) ? (json as RecipientsResponse).data : [];
    },
    enabled: Boolean(cid) && Boolean(cap) && enabled,
    staleTime: 15_000,
  });
}

export function useShareDonationMutation(chapterId: string | undefined) {
  const queryClient = useQueryClient();
  const cid = chapterId?.trim() ?? '';

  return useMutation({
    mutationFn: async (vars: { campaignId: string; profileIds: string[] }): Promise<number> => {
      const cap = vars.campaignId.trim();
      const res = await fetch(`/api/chapters/${cid}/donations/campaigns/${cap}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ profileIds: vars.profileIds }),
      });
      const json = (await res.json()) as ShareResponse;
      if (!res.ok) {
        const msg =
          typeof json.error === 'string' ? json.error : `Request failed (${res.status})`;
        const err = new Error(msg) as Error & { status?: number; code?: string; issues?: unknown };
        err.status = res.status;
        if (typeof json.code === 'string') err.code = json.code;
        if (json.issues !== undefined) err.issues = json.issues;
        throw err;
      }
      return json.data?.saved ?? 0;
    },
    onSuccess: (_saved, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['donation-recipients', cid, vars.campaignId] });
      void queryClient.invalidateQueries({
        queryKey: ['donation-share-candidates', cid, vars.campaignId],
      });
    },
  });
}
