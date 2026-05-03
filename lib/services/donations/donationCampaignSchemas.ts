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
    /** Optional copy for UI and Stripe Product.description (Stripe path). */
    description: z.string().max(2000).optional(),
    /** Public https URL for hero image; Stripe Product.images[0] when using Connect. */
    heroImageUrl: z.string().max(2048).optional(),
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
    const img = data.heroImageUrl?.trim();
    if (img) {
      try {
        const url = new URL(img);
        if (url.protocol !== 'https:') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Hero image URL must use https',
            path: ['heroImageUrl'],
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid hero image URL',
          path: ['heroImageUrl'],
        });
      }
    }
  });

export type DonationCampaignPostBody = z.infer<typeof donationCampaignPostBodySchema>;
