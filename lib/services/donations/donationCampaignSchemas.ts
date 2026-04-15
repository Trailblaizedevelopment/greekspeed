import { z } from 'zod';

/** Allowed on `POST …/donations/campaigns` — open (Payment + goal) or fundraiser (Fundraising + goal). */
export const donationCampaignCreateKindSchema = z.enum(['open', 'fundraiser']);

export const donationCampaignPostBodySchema = z
  .object({
    title: z.string().min(1).max(500),
    kind: donationCampaignCreateKindSchema,
    /**
     * **Minor units (cents)** for Crowded `goalAmount` — required for both `open` and `fundraiser`.
     */
    goalAmountCents: z.number().int().positive(),
    /** Crowded `showOnPublicFundraisingChannels` — defaults true when omitted for `fundraiser`; ignored for `open`. */
    showOnPublicFundraisingChannels: z.boolean().optional(),
    crowdedShareUrl: z.string().url().max(2000).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'open' && data.showOnPublicFundraisingChannels !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'showOnPublicFundraisingChannels applies only to fundraiser campaigns',
        path: ['showOnPublicFundraisingChannels'],
      });
    }
  });

export type DonationCampaignPostBody = z.infer<typeof donationCampaignPostBodySchema>;
