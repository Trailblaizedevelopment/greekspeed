import { z } from 'zod';

/** Trailblaize donation drive ↔ Crowded collection kinds (portal: Payment fixed/open, Fundraising). */
export const donationCampaignKindSchema = z.enum(['fixed', 'open', 'fundraiser']);

export const donationCampaignPostBodySchema = z
  .object({
    title: z.string().min(1).max(500),
    kind: donationCampaignKindSchema,
    /** Required for `fixed` — Crowded minor units (cents). Omit for `open` / `fundraiser`. */
    requestedAmountCents: z.number().int().positive().optional(),
    /**
     * Required for `open` and `fundraiser` — **minor units (cents)** for Crowded `goalAmount`
     * (aligned with portal captures; confirm with Crowded if amounts disagree).
     */
    goalAmountCents: z.number().int().positive().optional(),
    /** Crowded `showOnPublicFundraisingChannels` — defaults true when omitted for `fundraiser`. */
    showOnPublicFundraisingChannels: z.boolean().optional(),
    crowdedShareUrl: z.string().url().max(2000).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'fixed') {
      if (data.requestedAmountCents == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'requestedAmountCents is required for fixed campaigns',
          path: ['requestedAmountCents'],
        });
      }
    }
    if (data.kind === 'open' || data.kind === 'fundraiser') {
      if (data.goalAmountCents == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'goalAmountCents is required for open and fundraiser campaigns',
          path: ['goalAmountCents'],
        });
      }
      if (data.requestedAmountCents != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'requestedAmountCents must not be set for open or fundraiser campaigns',
          path: ['requestedAmountCents'],
        });
      }
    }
  });

export type DonationCampaignPostBody = z.infer<typeof donationCampaignPostBodySchema>;
