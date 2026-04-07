/**
 * Zod schemas for Crowded API responses — optional validation via CROWDED_VALIDATE_RESPONSES.
 */
import { z } from 'zod';

export const crowdedPaginationMetaSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  sort: z.string(),
  order: z.string(),
});

export const crowdedListMetaSchema = z.object({
  pagination: crowdedPaginationMetaSchema,
});

export const crowdedOrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
});

export const crowdedOrganizationListResponseSchema = z.object({
  data: z.array(crowdedOrganizationSchema),
  meta: crowdedListMetaSchema,
});

export const crowdedChapterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  organization: z.string(),
  organizationId: z.string().uuid(),
  status: z.string(),
  businessVertical: z.string(),
  createdAt: z.string(),
});

export const crowdedChapterListResponseSchema = z.object({
  data: z.array(crowdedChapterSchema),
  meta: crowdedListMetaSchema,
});

export const crowdedContactSchema = z.object({
  id: z.string().uuid(),
  chapterId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  mobile: z.string().optional(),
  email: z.string().optional(),
  dateOfBirth: z.string().optional(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  archivedAt: z.string().nullable().optional(),
});

export const crowdedContactListResponseSchema = z.object({
  data: z.array(crowdedContactSchema),
  meta: crowdedListMetaSchema,
});

export const crowdedContactSingleResponseSchema = z.object({
  data: crowdedContactSchema,
});

export const crowdedAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.string(),
  accountNumber: z.string().optional(),
  routingNumber: z.string().optional(),
  currency: z.string(),
  balance: z.number().optional(),
  hold: z.number().optional(),
  available: z.number().optional(),
  contactId: z.string().optional(),
  createdAt: z.string(),
});

export const crowdedAccountListResponseSchema = z.object({
  data: z.array(crowdedAccountSchema),
  meta: crowdedListMetaSchema,
});

export const crowdedAccountSingleResponseSchema = z.object({
  data: crowdedAccountSchema,
});
