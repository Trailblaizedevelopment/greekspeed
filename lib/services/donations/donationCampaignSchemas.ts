import { z } from 'zod';

/** Allowed on `POST …/donations/campaigns` — open (Payment + goal) or fundraiser (Fundraising + goal). */
export const donationCampaignCreateKindSchema = z.enum(['open', 'fundraiser']);

export const donationCampaignPostBodySchema = z
  .object({
    title: z.string().min(1).max(500),
    kind: donationCampaignCreateKindSchema,
    /** **Minor units (cents)** — goal cap for `open` donations; fixed amount for `fundraiser`. */
    goalAmountCents: z.number().int().positive(),
    /** Stored in campaign metadata for `fundraiser`; ignored for `open`. */
    showOnPublicFundraisingChannels: z.boolean().optional(),
    /** Optional copy for UI and Stripe Product.description (Stripe path). */
    description: z.string().max(2000).optional(),
    /** Public https URL for hero image; Stripe Product.images[0] when using Connect. */
    heroImageUrl: z.string().max(2048).optional(),
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

/** PATCH `/api/chapters/[id]/donations/campaigns/[campaignId]` — treasurer updates (hub, copy, hero, fundraiser metadata). */
export const donationCampaignPatchBodySchema = z
  .object({
    chapterHubVisible: z.boolean().optional(),
    title: z.string().min(1).max(500).optional(),
    description: z.union([z.string().max(2000), z.null()]).optional(),
    heroImageUrl: z.union([z.string().max(2048), z.null()]).optional(),
    showOnPublicFundraisingChannels: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const any =
      data.chapterHubVisible !== undefined ||
      data.title !== undefined ||
      data.description !== undefined ||
      data.heroImageUrl !== undefined ||
      data.showOnPublicFundraisingChannels !== undefined;
    if (!any) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field is required',
      });
    }
    const hero = data.heroImageUrl;
    if (hero !== undefined && hero !== null) {
      const t = hero.trim();
      if (t) {
        try {
          const u = new URL(t);
          if (u.protocol !== 'https:') {
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
    }
  });

export type DonationCampaignPatchBody = z.infer<typeof donationCampaignPatchBodySchema>;
