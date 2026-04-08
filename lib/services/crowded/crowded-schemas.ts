/**
 * Zod schemas for Crowded API responses — optional validation via CROWDED_VALIDATE_RESPONSES.
 */
import { z } from 'zod';

/** Crowded account ids may be UUIDs or numeric strings (e.g. `"12832675"`). */
const crowdedAccountApiIdString = z.string().min(1);

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

/** List/single account: Crowded may send `accountId`, snake_case, `uuid`, JSON:API `attributes`, or nested `account` (normalized before parse in the client). */
export const crowdedAccountSchema = z
  .object({
    id: crowdedAccountApiIdString.optional(),
    accountId: crowdedAccountApiIdString.optional(),
    account_id: crowdedAccountApiIdString.optional(),
    uuid: crowdedAccountApiIdString.optional(),
    accountUuid: crowdedAccountApiIdString.optional(),
    account_uuid: crowdedAccountApiIdString.optional(),
    name: z.string(),
    status: z.string(),
    accountNumber: z.string().optional(),
    routingNumber: z.string().optional(),
    currency: z.string(),
    balance: z.number().optional(),
    hold: z.number().optional(),
    available: z.number().optional(),
    contactId: z.string().optional(),
    product: z.string().optional(),
    createdAt: z.string(),
  })
  .refine(
    (d) =>
      !!(
        d.id ??
        d.accountId ??
        d.account_id ??
        d.uuid ??
        d.accountUuid ??
        d.account_uuid
      ),
    {
      message:
        'Crowded account requires id, accountId, account_id, uuid, accountUuid, or account_uuid',
    }
  )
  .transform((d) => ({
    ...d,
    id: (d.id ??
      d.accountId ??
      d.account_id ??
      d.uuid ??
      d.accountUuid ??
      d.account_uuid) as string,
  }));

export const crowdedAccountListResponseSchema = z.object({
  data: z.array(crowdedAccountSchema),
  meta: crowdedListMetaSchema,
});

export const crowdedAccountSingleResponseSchema = z.object({
  data: crowdedAccountSchema,
});

/** Bulk POST …/chapters/:id/accounts — item product enum */
export const crowdedBulkCreateAccountItemProductSchema = z.enum(['wallet', 'perdiem']);

export const crowdedBulkCreateAccountItemSchema = z.object({
  contactId: z.string().uuid(),
  product: crowdedBulkCreateAccountItemProductSchema,
});

/** Trailblaize app API body (wrapped into Crowded wire `{ data }` by the route). */
export const crowdedBulkCreateAccountsAppRequestSchema = z.object({
  items: z.array(crowdedBulkCreateAccountItemSchema).min(1).max(500),
  idempotencyKey: z.string().min(1).max(200),
});

/** Crowded API request wire shape */
export const crowdedBulkCreateAccountsWireRequestSchema = z.object({
  data: z.object({
    items: z.array(crowdedBulkCreateAccountItemSchema),
    idempotencyKey: z.string().min(1),
  }),
});

export const crowdedBulkCreateAccountResultSchema = z.object({
  contactId: z.string(),
  accountId: z.string(),
  product: z.string(),
  error: z.boolean(),
  message: z.string(),
  accountCreated: z.boolean(),
  cardCreated: z.boolean(),
});

export const crowdedBulkCreateAccountsResponseSchema = z.object({
  data: z.object({
    totalProcessed: z.number(),
    successCount: z.number(),
    failedCount: z.number(),
    results: z.array(crowdedBulkCreateAccountResultSchema),
  }),
});

/** POST …/chapters/:id/collections — response (201) */
export const crowdedCollectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  requestedAmount: z.number(),
  goalAmount: z.number().nullable().optional(),
  createdAt: z.string(),
});

export const crowdedCollectionSingleResponseSchema = z.object({
  data: crowdedCollectionSchema,
});

/** App route: create collection */
export const crowdedCreateCollectionAppRequestSchema = z.object({
  title: z.string().min(1).max(500),
  requestedAmount: z.number().int().positive(),
});

/** POST …/collections/:id/intents — response (200) */
export const crowdedCollectIntentSchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid(),
  requestedAmount: z.number(),
  paidAmount: z.number(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  status: z.string(),
  payments: z.array(z.unknown()),
  createdAt: z.string(),
  successUrl: z.string().nullable().optional(),
  failureUrl: z.string().nullable().optional(),
  paymentUrl: z.string().min(1),
});

export const crowdedCollectIntentSingleResponseSchema = z.object({
  data: crowdedCollectIntentSchema,
});

/** App route: create intent (Crowded `data` payload) */
export const crowdedCreateCollectIntentAppRequestSchema = z.object({
  contactId: z.string().uuid(),
  requestedAmount: z.number().int().positive(),
  payerIp: z.string().min(1).max(100),
  userConsented: z.literal(true),
});
