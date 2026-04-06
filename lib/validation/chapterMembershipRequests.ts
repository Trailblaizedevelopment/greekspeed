import { z } from 'zod';

/** Body for POST /api/chapter-membership-requests (marketing alumni queue). */
export const createMarketingMembershipRequestBodySchema = z.object({
  chapterId: z.string().uuid('chapterId must be a valid UUID'),
});

export type CreateMarketingMembershipRequestBody = z.infer<
  typeof createMarketingMembershipRequestBodySchema
>;

/** Query for GET /api/chapter-membership-requests (admin pending list). */
export const listPendingMembershipRequestsQuerySchema = z.object({
  chapterId: z.string().uuid('chapterId must be a valid UUID'),
});

export type ListPendingMembershipRequestsQuery = z.infer<
  typeof listPendingMembershipRequestsQuerySchema
>;

/** Path param `id` for approve/reject routes. */
export const membershipRequestIdParamSchema = z.string().uuid('Invalid request id');

/** POST /api/chapter-membership-requests/[id]/approve — empty JSON object only. */
export const approveMembershipRequestBodySchema = z.object({}).strict();

/** POST /api/chapter-membership-requests/[id]/reject */
export const rejectMembershipRequestBodySchema = z
  .object({
    rejectionReason: z.string().trim().max(2000).optional(),
  })
  .strict();
